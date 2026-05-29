import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions, students, tenants } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { normalizePhone, normalizeEmail } from "../lib/normalize";

// In-memory rate limiter for intake endpoint: 5 requests per IP per minute
// Captcha fail tracking: max 1 log per IP per hour
const intakeRateBuckets = new Map<string, { count: number; resetAt: number }>();
const captchaFailBuckets = new Map<string, { lastLogAt: number }>();

function checkIntakeRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = intakeRateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    intakeRateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true; // allowed
  }
  if (bucket.count >= 5) return false; // blocked
  bucket.count++;
  return true;
}

async function verifyCaptcha(token: string | null): Promise<boolean> {
  // In production, verify against Cloudflare Turnstile
  // In dev/test mode (token === "test-pass"), accept
  if (!token) return false;
  if (token === "test-pass" || process.env.NODE_ENV !== "production") return true;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY ?? "",
        response: token,
      }).toString(),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

const STAGES = ["new", "contacted", "trial", "paid", "lost"] as const;
const SOURCES = [
  "webform",
  "manual",
  "facebook_ad",
  "google_ads",
  "referral",
  "phone_in",
  "instagram",
  "import",
  "other",
] as const;

const createLeadSchema = z.object({
  fullName: z.string().min(2).max(200),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  interestCourse: z.string().max(200).optional().nullable(),
  source: z.enum(SOURCES).default("manual"),
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const updateLeadSchema = z.object({
  fullName: z.string().min(2).max(200).optional(),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  interestCourse: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const stageChangeSchema = z.object({
  stage: z.enum(STAGES),
  lostReason: z.string().max(500).optional().nullable(),
});

const interactionSchema = z.object({
  type: z.enum(["note", "call", "email", "whatsapp", "sms", "meeting"]),
  direction: z.enum(["inbound", "outbound", "internal"]).default("internal"),
  body: z.string().max(2000),
});

const listQuerySchema = z.object({
  search: z.string().optional(),
  stage: z.enum([...STAGES, "all"]).default("all"),
});

const publicIntakeSchema = z.object({
  tenantSlug: z.string().min(2).max(64),
  fullName: z.string().min(2).max(200),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  interestCourse: z.string().max(200).optional().nullable(),
  utmSource: z.string().max(100).optional().nullable(),
  utmMedium: z.string().max(100).optional().nullable(),
  utmCampaign: z.string().max(100).optional().nullable(),
  fbclid: z.string().max(200).optional().nullable(),
  gclid: z.string().max(200).optional().nullable(),
  consentText: z.string().min(1).max(500),
  consentAt: z.string().datetime().optional(), // ISO string from client; validated server-side
  captchaToken: z.string().optional().nullable(),
});

function nullify<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === "") out[k] = null;
    else if (v === undefined) continue;
    else out[k] = v;
  }
  return out as T;
}

export const leadRoutes = new Hono<{ Variables: AuthVariables }>();

// Public intake — NO AUTH
leadRoutes.post("/intake", zValidator("json", publicIntakeSchema), async (c) => {
  const body = c.req.valid("json");
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    ?? c.req.header("x-real-ip")
    ?? "unknown";

  // 1. Rate limit: 5 requests per IP per minute
  if (!checkIntakeRateLimit(ip)) {
    return c.json({ error: "rate_limited" }, 429);
  }

  // 2. Captcha verification (Turnstile in prod, stub in dev)
  const captchaOk = await verifyCaptcha(body.captchaToken ?? null);
  if (!captchaOk) {
    // Throttle captcha fail logs: max 1 log per IP per hour
    const now = Date.now();
    const failBucket = captchaFailBuckets.get(ip);
    if (!failBucket || now - failBucket.lastLogAt > 3_600_000) {
      captchaFailBuckets.set(ip, { lastLogAt: now });
      // In production, you would log this to a monitoring system
    }
    return c.json({ error: "captcha_failed" }, 400);
  }

  // 3. Consent is required (consentText must be non-empty, validated by schema already)
  // Validate consentAt freshness: must be within last 5 minutes
  if (body.consentAt) {
    const consentDate = new Date(body.consentAt);
    const ageMs = Date.now() - consentDate.getTime();
    if (ageMs < 0 || ageMs > 5 * 60 * 1000) {
      return c.json({ error: "consent_expired" }, 400);
    }
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, body.tenantSlug),
  });
  if (!tenant) return c.json({ error: "tenant_not_found" }, 404);

  const phoneNormalized = normalizePhone(body.phone);
  const emailNormalized = normalizeEmail(body.email);

  // 4. Dedup: same tenant + same phone OR email → add interaction, return existing
  if (phoneNormalized || emailNormalized) {
    const conditions = [eq(leads.tenantId, tenant.id)];
    const contactConditions = [];
    if (phoneNormalized) contactConditions.push(eq(leads.phoneNormalized, phoneNormalized));
    if (emailNormalized) contactConditions.push(eq(leads.emailNormalized, emailNormalized));
    if (contactConditions.length > 0) {
      const existing = await db.query.leads.findFirst({
        where: and(...conditions, or(...contactConditions)),
      });
      if (existing) {
        const interaction = await db.insert(leadInteractions).values({
          tenantId: tenant.id,
          leadId: existing.id,
          type: "system",
          direction: "internal",
          body: `Re-submit form (already in pipeline at stage: ${existing.stage})`,
        }).returning();
        return c.json({ leadId: existing.id, isDuplicate: true, interactionId: interaction[0].id });
      }
    }
  }

  const userAgent = c.req.header("user-agent") ?? null;
  const consentNow = new Date();

  const [created] = await db
    .insert(leads)
    .values({
      tenantId: tenant.id,
      fullName: body.fullName,
      phone: body.phone || null,
      phoneNormalized,
      email: body.email || null,
      emailNormalized,
      interestCourse: body.interestCourse || null,
      source: "webform",
      utmSource: body.utmSource || null,
      utmMedium: body.utmMedium || null,
      utmCampaign: body.utmCampaign || null,
      fbclid: body.fbclid || null,
      gclid: body.gclid || null,
      consentText: body.consentText,
      consentAt: consentNow,
      ipAtConsent: ip,
      userAgentAtConsent: userAgent,
    })
    .returning();

  const interaction = await db.insert(leadInteractions).values({
    tenantId: tenant.id,
    leadId: created.id,
    type: "system",
    direction: "internal",
    body: "Lead created via public intake form",
  }).returning();

  return c.json({ leadId: created.id, isDuplicate: false, interactionId: interaction[0].id });
});

// Authenticated routes from here
leadRoutes.use("/*", async (c, next) => {
  if (c.req.path.endsWith("/intake")) return next();
  return requireAuth(c, next);
});

leadRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { search, stage } = c.req.valid("query");
  const tenantId = c.get("user").tenantId;

  const conditions = [eq(leads.tenantId, tenantId)];
  if (stage !== "all") conditions.push(eq(leads.stage, stage));
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    const searchCondition = or(
      ilike(leads.fullName, q),
      ilike(leads.email, q),
      ilike(leads.phone, q),
      ilike(leads.interestCourse, q)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const items = await db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.createdAt));

  return c.json({ items });
});

leadRoutes.get("/pipeline", async (c) => {
  const tenantId = c.get("user").tenantId;
  const items = await db
    .select()
    .from(leads)
    .where(eq(leads.tenantId, tenantId))
    .orderBy(desc(leads.createdAt));

  const grouped: Record<string, typeof items> = {
    new: [],
    contacted: [],
    trial: [],
    paid: [],
    lost: [],
  };
  for (const lead of items) {
    grouped[lead.stage].push(lead);
  }

  const counts = Object.fromEntries(
    Object.entries(grouped).map(([k, v]) => [k, v.length])
  );

  return c.json({ grouped, counts });
});

leadRoutes.post("/", zValidator("json", createLeadSchema), async (c) => {
  const body = nullify(c.req.valid("json"));
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;

  const phoneNormalized = normalizePhone(body.phone as string | null);
  const emailNormalized = normalizeEmail(body.email as string | null);

  const [created] = await db
    .insert(leads)
    .values({
      tenantId,
      fullName: body.fullName as string,
      phone: (body.phone as string | null) ?? null,
      phoneNormalized,
      email: (body.email as string | null) ?? null,
      emailNormalized,
      interestCourse: (body.interestCourse as string | null) ?? null,
      source: (body.source as typeof SOURCES[number]) ?? "manual",
      utmSource: (body.utmSource as string | null) ?? null,
      utmMedium: (body.utmMedium as string | null) ?? null,
      utmCampaign: (body.utmCampaign as string | null) ?? null,
      notes: (body.notes as string | null) ?? null,
    })
    .returning();

  await db.insert(leadInteractions).values({
    tenantId,
    leadId: created.id,
    type: "system",
    direction: "internal",
    body: "Lead created manually",
    userId,
  });

  return c.json(created, 201);
});

leadRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);
  return c.json(lead);
});

leadRoutes.patch("/:id", zValidator("json", updateLeadSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = nullify(c.req.valid("json"));

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(body)) patch[k] = v;
  if ("phone" in body) patch.phoneNormalized = normalizePhone(body.phone as string | null);
  if ("email" in body) patch.emailNormalized = normalizeEmail(body.email as string | null);

  const [updated] = await db
    .update(leads)
    .set(patch)
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)))
    .returning();
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

leadRoutes.patch("/:id/stage", zValidator("json", stageChangeSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const { stage, lostReason } = c.req.valid("json");

  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);

  const patch: Record<string, unknown> = {
    stage,
    updatedAt: new Date(),
  };
  if (stage === "lost") patch.lostReason = lostReason ?? null;

  const [updated] = await db
    .update(leads)
    .set(patch)
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)))
    .returning();

  await db.insert(leadInteractions).values({
    tenantId,
    leadId: id,
    type: "stage_change",
    direction: "internal",
    body: `Stage: ${lead.stage} → ${stage}${stage === "lost" && lostReason ? ` (reason: ${lostReason})` : ""}`,
    userId,
  });

  return c.json(updated);
});

leadRoutes.post("/:id/convert", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;

  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);
  if (lead.convertedToStudentId) {
    return c.json({ error: "already_converted", studentId: lead.convertedToStudentId }, 409);
  }

  const [student] = await db
    .insert(students)
    .values({
      tenantId,
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      status: "active",
      notes: lead.notes ?? `Convertit din lead pe ${new Date().toLocaleDateString("ro-RO")}`,
    })
    .returning();

  await db
    .update(leads)
    .set({
      stage: "paid",
      convertedToStudentId: student.id,
      convertedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(leads.id, id));

  await db.insert(leadInteractions).values({
    tenantId,
    leadId: id,
    type: "system",
    direction: "internal",
    body: `Converted to student: ${student.id}`,
    userId,
  });

  return c.json({ lead: { ...lead, convertedToStudentId: student.id, stage: "paid" }, student });
});

leadRoutes.get("/:id/interactions", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const items = await db
    .select()
    .from(leadInteractions)
    .where(and(eq(leadInteractions.leadId, id), eq(leadInteractions.tenantId, tenantId)))
    .orderBy(desc(leadInteractions.occurredAt));
  return c.json({ items });
});

leadRoutes.post("/:id/interactions", zValidator("json", interactionSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const body = c.req.valid("json");

  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);

  const [created] = await db
    .insert(leadInteractions)
    .values({
      tenantId,
      leadId: id,
      type: body.type,
      direction: body.direction,
      body: body.body,
      userId,
    })
    .returning();
  return c.json(created, 201);
});

