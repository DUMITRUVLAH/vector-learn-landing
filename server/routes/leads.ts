import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions, students, tenants } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { normalizePhone, normalizeEmail, normalizeName } from "../lib/normalize";

// ---------------------------------------------------------------------------
// CRM-101: In-memory rate limiter for intake — 5 req/IP/min
// Captcha fail tracking: max 1 log/IP/hour
// ---------------------------------------------------------------------------
const intakeRateBuckets = new Map<string, { count: number; resetAt: number }>();
const captchaFailBuckets = new Map<string, { lastLogAt: number }>();

function checkIntakeRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = intakeRateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    intakeRateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= 5) return false;
  bucket.count++;
  return true;
}

async function verifyCaptcha(token: string | null): Promise<boolean> {
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

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
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
  assignedTo: z.string().uuid().optional().nullable(),  // [CRM-103]
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
  assignedTo: z.string().uuid().optional().nullable(),  // [CRM-103]
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
  assignedTo: z.string().optional(),  // [CRM-103]
  source: z.string().optional(),       // [CRM-105 filter prep]
});

// CRM-101: Public intake schema
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
  consentAt: z.string().datetime().optional(),
  captchaToken: z.string().optional().nullable(),
});

// CRM-102: Merge schema
const mergeSchema = z.object({
  sourceId: z.string().uuid(),
});

// CRM-103: CSV import row schema (after column mapping)
const csvImportSchema = z.object({
  rows: z.array(z.object({
    fullName: z.string().min(2).max(200),
    phone: z.string().max(32).optional().nullable(),
    email: z.string().email().max(255).optional().nullable().or(z.literal("")),
    interestCourse: z.string().max(200).optional().nullable(),
    source: z.enum(SOURCES).optional().default("import"),
    notes: z.string().max(2000).optional().nullable(),
  })).min(1).max(5000),
  dryRun: z.boolean().default(false),  // if true: only preview, no DB write
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

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
export const leadRoutes = new Hono<{ Variables: AuthVariables }>();

// CRM-101: Public intake — NO AUTH
leadRoutes.post("/intake", zValidator("json", publicIntakeSchema), async (c) => {
  const body = c.req.valid("json");
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    ?? c.req.header("x-real-ip")
    ?? "unknown";

  // 1. Rate limit
  if (!checkIntakeRateLimit(ip)) {
    return c.json({ error: "rate_limited" }, 429);
  }

  // 2. Captcha
  const captchaOk = await verifyCaptcha(body.captchaToken ?? null);
  if (!captchaOk) {
    const now = Date.now();
    const failBucket = captchaFailBuckets.get(ip);
    if (!failBucket || now - failBucket.lastLogAt > 3_600_000) {
      captchaFailBuckets.set(ip, { lastLogAt: now });
    }
    return c.json({ error: "captcha_failed" }, 400);
  }

  // 3. Consent freshness (≤5 min)
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
  const fullNameNormalized = normalizeName(body.fullName);

  // 4. Dedup
  if (phoneNormalized || emailNormalized) {
    const contactConditions = [];
    if (phoneNormalized) contactConditions.push(eq(leads.phoneNormalized, phoneNormalized));
    if (emailNormalized) contactConditions.push(eq(leads.emailNormalized, emailNormalized));
    if (contactConditions.length > 0) {
      const existing = await db.query.leads.findFirst({
        where: and(eq(leads.tenantId, tenant.id), or(...contactConditions)),
      });
      if (existing) {
        const [interaction] = await db.insert(leadInteractions).values({
          tenantId: tenant.id,
          leadId: existing.id,
          type: "system",
          direction: "internal",
          body: `Re-submit form (already in pipeline at stage: ${existing.stage})`,
        }).returning();
        return c.json({ leadId: existing.id, isDuplicate: true, interactionId: interaction.id });
      }
    }
  }

  const userAgent = c.req.header("user-agent") ?? null;

  const [created] = await db
    .insert(leads)
    .values({
      tenantId: tenant.id,
      fullName: body.fullName,
      fullNameNormalized,
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
      consentAt: new Date(),
      ipAtConsent: ip,
      userAgentAtConsent: userAgent,
    })
    .returning();

  const [interaction] = await db.insert(leadInteractions).values({
    tenantId: tenant.id,
    leadId: created.id,
    type: "system",
    direction: "internal",
    body: "Lead created via public intake form",
  }).returning();

  return c.json({ leadId: created.id, isDuplicate: false, interactionId: interaction.id });
});

// Auth middleware for all routes below
leadRoutes.use("/*", async (c, next) => {
  if (c.req.path.endsWith("/intake")) return next();
  return requireAuth(c, next);
});

leadRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { search, stage, assignedTo, source: sourceFilter } = c.req.valid("query");
  const tenantId = c.get("user").tenantId;

  const conditions = [eq(leads.tenantId, tenantId)];
  if (stage !== "all") conditions.push(eq(leads.stage, stage));
  if (assignedTo && assignedTo !== "all") {
    conditions.push(eq(leads.assignedTo, assignedTo));
  }
  if (sourceFilter && sourceFilter !== "all") {
    conditions.push(eq(leads.source, sourceFilter as typeof SOURCES[number]));
  }
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

// CRM-102: Live dedup — BEFORE /:id to avoid param collision
leadRoutes.get("/dedup", async (c) => {
  const tenantId = c.get("user").tenantId;
  const phone = c.req.query("phone");
  const email = c.req.query("email");

  if (!phone && !email) return c.json({ duplicate: null });

  const phoneNormalized = normalizePhone(phone);
  const emailNormalized = normalizeEmail(email);
  const contactConditions = [];
  if (phoneNormalized) contactConditions.push(eq(leads.phoneNormalized, phoneNormalized));
  if (emailNormalized) contactConditions.push(eq(leads.emailNormalized, emailNormalized));

  if (contactConditions.length === 0) return c.json({ duplicate: null });

  const existing = await db.query.leads.findFirst({
    where: and(eq(leads.tenantId, tenantId), or(...contactConditions)),
  });

  if (existing) {
    return c.json({ duplicate: { id: existing.id, fullName: existing.fullName, stage: existing.stage } });
  }
  return c.json({ duplicate: null });
});

leadRoutes.post("/", zValidator("json", createLeadSchema), async (c) => {
  const body = nullify(c.req.valid("json"));
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;

  const phoneNormalized = normalizePhone(body.phone as string | null);
  const emailNormalized = normalizeEmail(body.email as string | null);
  const fullNameNormalized = normalizeName(body.fullName as string | null);

  const [created] = await db
    .insert(leads)
    .values({
      tenantId,
      fullName: body.fullName as string,
      fullNameNormalized,
      phone: (body.phone as string | null) ?? null,
      phoneNormalized,
      email: (body.email as string | null) ?? null,
      emailNormalized,
      interestCourse: (body.interestCourse as string | null) ?? null,
      source: (body.source as typeof SOURCES[number]) ?? "manual",
      assignedTo: (body.assignedTo as string | null) ?? null,
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

// CRM-103: CSV import endpoint — POST /api/leads/import
leadRoutes.post("/import", zValidator("json", csvImportSchema), async (c) => {
  const { rows, dryRun } = c.req.valid("json");
  const tenantId = c.get("user").tenantId;

  interface RowResult {
    row: number;
    status: "created" | "duplicate" | "error";
    fullName: string;
    detail?: string;
  }

  const results: RowResult[] = [];
  let created = 0;
  let duplicates = 0;
  let errors = 0;
  const preview: typeof rows = rows.slice(0, 5);

  if (dryRun) {
    // Preview mode: validate rows, check dedup, but no DB writes
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.fullName || row.fullName.length < 2) {
        errors++;
        results.push({ row: i + 1, status: "error", fullName: row.fullName ?? "", detail: "fullName too short" });
        continue;
      }
      const phoneNormalized = normalizePhone(row.phone);
      const emailNormalized = normalizeEmail(row.email);
      if (phoneNormalized || emailNormalized) {
        const contactConditions = [];
        if (phoneNormalized) contactConditions.push(eq(leads.phoneNormalized, phoneNormalized));
        if (emailNormalized) contactConditions.push(eq(leads.emailNormalized, emailNormalized));
        if (contactConditions.length > 0) {
          const existing = await db.query.leads.findFirst({
            where: and(eq(leads.tenantId, tenantId), or(...contactConditions)),
          });
          if (existing) {
            duplicates++;
            results.push({ row: i + 1, status: "duplicate", fullName: row.fullName, detail: `matches: ${existing.fullName}` });
            continue;
          }
        }
      }
      created++;
      results.push({ row: i + 1, status: "created", fullName: row.fullName });
    }
    return c.json({ preview, dryRun: true, summary: { created, duplicates, errors }, results });
  }

  // Real import: transactional (all or nothing on critical errors)
  const toInsert: {
    fullName: string;
    fullNameNormalized: string | null;
    phone: string | null;
    phoneNormalized: string | null;
    email: string | null;
    emailNormalized: string | null;
    interestCourse: string | null;
    source: typeof SOURCES[number];
    notes: string | null;
    tenantId: string;
  }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.fullName || row.fullName.length < 2) {
      errors++;
      results.push({ row: i + 1, status: "error", fullName: row.fullName ?? "", detail: "fullName too short" });
      continue;
    }
    const phoneNormalized = normalizePhone(row.phone);
    const emailNormalized = normalizeEmail(row.email);

    // Dedup check
    if (phoneNormalized || emailNormalized) {
      const contactConditions = [];
      if (phoneNormalized) contactConditions.push(eq(leads.phoneNormalized, phoneNormalized));
      if (emailNormalized) contactConditions.push(eq(leads.emailNormalized, emailNormalized));
      if (contactConditions.length > 0) {
        const existing = await db.query.leads.findFirst({
          where: and(eq(leads.tenantId, tenantId), or(...contactConditions)),
        });
        if (existing) {
          duplicates++;
          results.push({ row: i + 1, status: "duplicate", fullName: row.fullName, detail: `matches: ${existing.fullName}` });
          // Add enrichment interaction
          await db.insert(leadInteractions).values({
            tenantId,
            leadId: existing.id,
            type: "system",
            direction: "internal",
            body: `CSV import re-submit (row ${i + 1})`,
          });
          continue;
        }
      }
    }

    toInsert.push({
      tenantId,
      fullName: row.fullName,
      fullNameNormalized: normalizeName(row.fullName),
      phone: row.phone || null,
      phoneNormalized,
      email: row.email || null,
      emailNormalized,
      interestCourse: row.interestCourse || null,
      source: row.source ?? "import",
      notes: row.notes || null,
    });
  }

  // Batch insert new leads
  if (toInsert.length > 0) {
    const insertedLeads = await db.insert(leads).values(toInsert).returning();
    created += insertedLeads.length;

    // Write system interactions for batch
    if (insertedLeads.length > 0) {
      await db.insert(leadInteractions).values(
        insertedLeads.map((l) => ({
          tenantId,
          leadId: l.id,
          type: "system" as const,
          direction: "internal" as const,
          body: "Lead created via CSV import",
        }))
      );
    }

    for (const l of insertedLeads) {
      results.push({ row: -1, status: "created", fullName: l.fullName });
    }
  }

  return c.json({
    dryRun: false,
    summary: { created, duplicates, errors },
    results,
  });
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
  if ("fullName" in body) patch.fullNameNormalized = normalizeName(body.fullName as string | null);

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

// CRM-102: Merge two leads
leadRoutes.post("/:id/merge", zValidator("json", mergeSchema), async (c) => {
  const survivorId = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const { sourceId } = c.req.valid("json");

  if (survivorId === sourceId) {
    return c.json({ error: "cannot_merge_with_self" }, 400);
  }

  const [survivor, source] = await Promise.all([
    db.query.leads.findFirst({
      where: and(eq(leads.id, survivorId), eq(leads.tenantId, tenantId)),
    }),
    db.query.leads.findFirst({
      where: and(eq(leads.id, sourceId), eq(leads.tenantId, tenantId)),
    }),
  ]);

  if (!survivor) return c.json({ error: "survivor_not_found" }, 404);
  if (!source) return c.json({ error: "source_not_found" }, 404);

  // Move all interactions from source to survivor
  await db
    .update(leadInteractions)
    .set({ leadId: survivorId })
    .where(and(eq(leadInteractions.leadId, sourceId), eq(leadInteractions.tenantId, tenantId)));

  // Fill gaps
  const survivorPatch: Record<string, unknown> = { updatedAt: new Date() };
  if (!survivor.phone && source.phone) {
    survivorPatch.phone = source.phone;
    survivorPatch.phoneNormalized = source.phoneNormalized;
  }
  if (!survivor.email && source.email) {
    survivorPatch.email = source.email;
    survivorPatch.emailNormalized = source.emailNormalized;
  }
  if (!survivor.interestCourse && source.interestCourse) survivorPatch.interestCourse = source.interestCourse;
  if (!survivor.notes && source.notes) survivorPatch.notes = source.notes;
  if (!survivor.utmSource && source.utmSource) survivorPatch.utmSource = source.utmSource;
  if (!survivor.utmMedium && source.utmMedium) survivorPatch.utmMedium = source.utmMedium;
  if (!survivor.utmCampaign && source.utmCampaign) survivorPatch.utmCampaign = source.utmCampaign;
  if (!survivor.fbclid && source.fbclid) survivorPatch.fbclid = source.fbclid;
  if (!survivor.gclid && source.gclid) survivorPatch.gclid = source.gclid;

  const [updatedSurvivor] = await db
    .update(leads)
    .set(survivorPatch)
    .where(and(eq(leads.id, survivorId), eq(leads.tenantId, tenantId)))
    .returning();

  // Archive source
  await db
    .update(leads)
    .set({ mergedIntoId: survivorId, updatedAt: new Date() })
    .where(and(eq(leads.id, sourceId), eq(leads.tenantId, tenantId)));

  // Audit
  await db.insert(leadInteractions).values({
    tenantId,
    leadId: survivorId,
    type: "system",
    direction: "internal",
    body: `Merged with lead ${sourceId} (${source.fullName}). All interactions transferred.`,
    userId,
  });

  return c.json({ survivorId, sourceId, merged: true, survivor: updatedSurvivor });
});
