import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions, students, tenants, pipelineStages, leadTasks, messageTemplates, families } from "../db/schema";
import { renderTemplate } from "../db/schema/templates";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { normalizePhone, normalizeEmail } from "../lib/normalize";
import { fireTrigger } from "../lib/automationEngine";

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
  assignedTo: z.string().uuid().optional().nullable(),
  /** CRM-113 */
  valueCents: z.number().int().min(0).default(0),
  debtCents: z.number().int().min(0).default(0),
  /** CRM-114 */
  company: z.string().max(300).optional().nullable(),
  dealName: z.string().max(300).optional().nullable(),
});

const updateLeadSchema = z.object({
  fullName: z.string().min(2).max(200).optional(),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email().max(255).optional().nullable().or(z.literal("")),
  interestCourse: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  valueCents: z.number().int().min(0).optional(),
  debtCents: z.number().int().min(0).optional(),
  company: z.string().max(300).optional().nullable(),
  dealName: z.string().max(300).optional().nullable(),
});

const stageChangeSchema = z.object({
  // Accept any string stage key (validates against pipeline_stages at runtime)
  stage: z.string().min(1).max(64),
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
  consentText: z.string().max(500),
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

// Public intake — NO AUTH (rate-limited by ip-level via reverse proxy in prod)
leadRoutes.post("/intake", zValidator("json", publicIntakeSchema), async (c) => {
  const body = c.req.valid("json");
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.slug, body.tenantSlug),
  });
  if (!tenant) return c.json({ error: "tenant_not_found" }, 404);

  const phoneNormalized = normalizePhone(body.phone);
  const emailNormalized = normalizeEmail(body.email);

  // Dedup: same tenant + same phone OR email → return existing
  if (phoneNormalized || emailNormalized) {
    const existing = await db.query.leads.findFirst({
      where: and(
        eq(leads.tenantId, tenant.id),
        or(
          phoneNormalized ? eq(leads.phoneNormalized, phoneNormalized) : undefined,
          emailNormalized ? eq(leads.emailNormalized, emailNormalized) : undefined
        )
      ),
    });
    if (existing) {
      await db.insert(leadInteractions).values({
        tenantId: tenant.id,
        leadId: existing.id,
        type: "system",
        direction: "internal",
        body: `Re-submit form (already in pipeline at stage: ${existing.stage})`,
      });
      return c.json({ leadId: existing.id, isDuplicate: true });
    }
  }

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? null;

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
      consentAt: new Date(),
      ipAtConsent: ip,
    })
    .returning();

  await db.insert(leadInteractions).values({
    tenantId: tenant.id,
    leadId: created.id,
    type: "system",
    direction: "internal",
    body: "Lead created via public intake form",
  });

  return c.json({ leadId: created.id, isDuplicate: false });
});

// Public dedup check (used by manual add form on blur)
leadRoutes.post("/check-duplicate", async (c) => {
  // This endpoint requires auth since it reveals internal data
  return c.json({ error: "use_authenticated_version" }, 400);
});

// Authenticated routes from here
leadRoutes.use("/*", async (c, next) => {
  if (c.req.path.endsWith("/intake")) return next();
  return requireAuth(c, next);
});

const dedupCheckSchema = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
});

leadRoutes.post("/dedup-check", zValidator("json", dedupCheckSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { phone, email } = c.req.valid("json");

  const phoneNormalized = normalizePhone(phone ?? null);
  const emailNormalized = normalizeEmail(email ?? null);

  if (!phoneNormalized && !emailNormalized) {
    return c.json({ duplicate: null });
  }

  const conditions = [eq(leads.tenantId, tenantId)];
  const orConds = [];
  if (phoneNormalized) orConds.push(eq(leads.phoneNormalized, phoneNormalized));
  if (emailNormalized) orConds.push(eq(leads.emailNormalized, emailNormalized));
  if (orConds.length > 0) conditions.push(or(...orConds)!);

  const existing = await db.query.leads.findFirst({
    where: and(...conditions),
  });

  if (!existing) return c.json({ duplicate: null });
  return c.json({ duplicate: { id: existing.id, fullName: existing.fullName, stage: existing.stage } });
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

  // Fetch next open task per lead for kanban badge
  const openTasks = await db
    .select()
    .from(leadTasks)
    .where(and(eq(leadTasks.tenantId, tenantId), eq(leadTasks.status, "open")))
    .orderBy(asc(leadTasks.dueAt));

  // Build map: leadId → earliest open task
  const nextTaskMap: Record<string, { dueAt: Date | null; title: string } | undefined> = {};
  for (const task of openTasks) {
    if (!nextTaskMap[task.leadId]) {
      nextTaskMap[task.leadId] = { dueAt: task.dueAt, title: task.title };
    }
  }

  // CRM-124: Fetch tenant SLA settings for badge computation
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { slaHotMinutes: true, slaDefaultHours: true, rotDays: true },
  }).catch(() => null);
  const slaHotMinutes = tenant?.slaHotMinutes ?? 15;
  const slaDefaultHours = tenant?.slaDefaultHours ?? 24;
  const rotDays = tenant?.rotDays ?? 7;
  const now = new Date();

  // Augment leads with nextTask + CRM-124 SLA badge (only for active stages)
  const augmented = items.map((lead) => {
    const isActive = !["paid", "lost"].includes(lead.stage);
    let slaBadge: "green" | "yellow" | "red" | null = null;
    if (isActive) {
      const minutesSince = (now.getTime() - new Date(lead.createdAt).getTime()) / 60000;
      const isHot = (lead.score ?? 0) >= 70;
      const thresholdMinutes = isHot ? slaHotMinutes : slaDefaultHours * 60;
      const rotThreshold = rotDays * 24 * 60; // rot_days in minutes
      if (minutesSince > rotThreshold) slaBadge = "red";
      else if (minutesSince > thresholdMinutes * 2) slaBadge = "red";
      else if (minutesSince > thresholdMinutes) slaBadge = "yellow";
      else slaBadge = "green";
    }
    return {
      ...lead,
      nextTask: nextTaskMap[lead.id] ?? null,
      slaBadge,
    };
  });

  const grouped: Record<string, typeof augmented> = {
    new: [],
    contacted: [],
    trial: [],
    paid: [],
    lost: [],
  };
  for (const lead of augmented) {
    (grouped[lead.stage] ??= []).push(lead);
  }

  const counts = Object.fromEntries(
    Object.entries(grouped).map(([k, v]) => [k, v.length])
  );

  // CRM-113: Aggregate value_cents and debt_cents per stage
  const valueSums = Object.fromEntries(
    Object.entries(grouped).map(([k, v]) => [k, v.reduce((s, l) => s + (l.valueCents ?? 0), 0)])
  );
  const totalValueCents = Object.values(valueSums).reduce((s, v) => s + v, 0);

  return c.json({ grouped, counts, valueSums, totalValueCents });
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
      assignedTo: (body.assignedTo as string | null) ?? null,
      valueCents: (body.valueCents as number | undefined) ?? 0,
      debtCents: (body.debtCents as number | undefined) ?? 0,
      company: (body.company as string | null) ?? null,
      dealName: (body.dealName as string | null) ?? null,
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

  // Fire automation trigger (fire-and-forget — don't block response)
  void fireTrigger(tenantId, "lead.created", created).catch(() => undefined);

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

  // Validate stage key against pipeline_stages (supports custom stages)
  const targetStage = await db.query.pipelineStages.findFirst({
    where: and(eq(pipelineStages.tenantId, tenantId), eq(pipelineStages.key, stage)),
  });
  // If pipeline_stages has no rows yet (first use), allow the 5 default stage keys
  const DEFAULT_KEYS = ["new", "contacted", "trial", "paid", "lost"];
  if (!targetStage && !DEFAULT_KEYS.includes(stage)) {
    return c.json({ error: "invalid_stage" }, 400);
  }

  const isLostStage = targetStage?.isLost ?? stage === "lost";
  if (isLostStage && !lostReason) {
    return c.json({ error: "lost_reason_required" }, 400);
  }

  const patch: Record<string, unknown> = {
    stage,
    updatedAt: new Date(),
  };
  if (isLostStage) patch.lostReason = lostReason ?? null;

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
    body: `Stage: ${lead.stage} → ${stage}${isLostStage && lostReason ? ` (reason: ${lostReason})` : ""}`,
    userId,
  });

  // Fire automation trigger (fire-and-forget — don't block response)
  if (updated) {
    void fireTrigger(tenantId, "lead.stage_changed", updated, { toStage: stage }).catch(() => undefined);
  }

  return c.json(updated);
});

// CRM-111: Enhanced convert schema with family/payer data
const convertLeadSchema = z.object({
  /** Payer (parent/guardian) — required for family model */
  payerName: z.string().min(1).max(200).optional().nullable(),
  payerPhone: z.string().max(32).optional().nullable(),
  payerEmail: z.string().email().max(255).optional().nullable().or(z.literal("")),
  /** Student override fields */
  studentName: z.string().min(2).max(200).optional().nullable(),
  studentPhone: z.string().max(32).optional().nullable(),
  studentEmail: z.string().email().max(255).optional().nullable().or(z.literal("")),
  birthDate: z.string().max(20).optional().nullable(), // ISO date string
  studentStatus: z.enum(["active", "trial"]).default("active"),
});

leadRoutes.post("/:id/convert", zValidator("json", convertLeadSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const body = c.req.valid("json");

  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);
  if (lead.convertedToStudentId) {
    return c.json({ error: "already_converted", studentId: lead.convertedToStudentId }, 409);
  }

  // Create or skip family record if payer data provided
  let familyId: string | null = null;
  const hasPayerData = body.payerName?.trim();
  if (hasPayerData) {
    const [family] = await db
      .insert(families)
      .values({
        tenantId,
        payerName: body.payerName!.trim(),
        payerPhone: body.payerPhone || null,
        payerEmail: body.payerEmail || null,
      })
      .returning();
    familyId = family.id;
  }

  // Create student
  const [student] = await db
    .insert(students)
    .values({
      tenantId,
      fullName: (body.studentName || lead.fullName).trim(),
      phone: body.studentPhone || lead.phone,
      email: body.studentEmail || lead.email,
      parentPhone: body.payerPhone || lead.phone,
      parentEmail: body.payerEmail || lead.email,
      birthDate: body.birthDate || null,
      status: body.studentStatus,
      notes: `Convertit din lead pe ${new Date().toLocaleDateString("ro-RO")}`,
      familyId: familyId || null,
    })
    .returning();

  // CRM-111: Google Offline Conversion stub (real integration deferred)
  if (lead.gclid) {
    // TODO: send Google Offline Conversion — gclid present
    // Stub: just log for now
  }

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
    body: `Convertit în student: ${student.id}${familyId ? ` (familie: ${familyId})` : ""}`,
    userId,
  });

  const updatedLead = { ...lead, convertedToStudentId: student.id, stage: "paid" as const };
  return c.json({ lead: updatedLead, student, familyId });
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

// PATCH /api/leads/:id/consent-revoke — revoke GDPR consent
leadRoutes.patch("/:id/consent-revoke", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;

  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);

  const [updated] = await db
    .update(leads)
    .set({ consentRevokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)))
    .returning();

  await db.insert(leadInteractions).values({
    tenantId,
    leadId: id,
    type: "system",
    direction: "internal",
    body: "Consimțământ retras de utilizator",
    userId,
  });

  return c.json(updated);
});

// POST /api/leads/:id/assign — reasign lead to a different user (CRM-111)
const assignLeadSchema = z.object({
  assignedTo: z.string().uuid().nullable(),
});

leadRoutes.post("/:id/assign", zValidator("json", assignLeadSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const { assignedTo } = c.req.valid("json");

  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);

  const [updated] = await db
    .update(leads)
    .set({ assignedTo, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)))
    .returning();

  await db.insert(leadInteractions).values({
    tenantId,
    leadId: id,
    type: "system",
    direction: "internal",
    body: `Reasignat de ${userId} → ${assignedTo ?? "neasignat"}`,
    userId,
  });

  return c.json(updated);
});

// POST /api/leads/:id/score — calculate and save lead score (CRM-111)
leadRoutes.post("/:id/score", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);

  // Score algorithm: signals that increase priority
  let score = 0;

  // Source signal (highest-intent sources score more)
  const sourceScores: Record<string, number> = {
    webform: 30,
    facebook_ad: 25,
    google_ads: 30,
    phone_in: 40,
    referral: 35,
    instagram: 20,
    manual: 15,
    import: 10,
    other: 10,
  };
  score += sourceScores[lead.source] ?? 10;

  // Stage signal
  const stageScores: Record<string, number> = {
    new: 10,
    contacted: 25,
    trial: 45,
    paid: 100,
    lost: 0,
  };
  score += stageScores[lead.stage] ?? 10;

  // Has email
  if (lead.email) score += 10;
  // Has phone
  if (lead.phone) score += 10;
  // Has course interest
  if (lead.interestCourse) score += 5;

  // Cap at 100
  score = Math.min(score, 100);

  const [updated] = await db
    .update(leads)
    .set({ score, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)))
    .returning();

  const badge = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  return c.json({ lead: updated, score, badge });
});

// POST /api/leads/:id/send-message — send email/WhatsApp/SMS from lead card (CRM-109)
const sendMessageSchema = z.object({
  channel: z.enum(["email", "whatsapp", "sms"]),
  templateId: z.string().uuid().optional().nullable(),
  subject: z.string().max(500).optional().nullable(),
  body: z.string().min(1).max(4000),
});

leadRoutes.post("/:id/send-message", zValidator("json", sendMessageSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const { channel, templateId, subject, body } = c.req.valid("json");

  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);

  // Block if consent revoked
  if (lead.consentRevokedAt) {
    return c.json({ error: "consent_revoked", message: "Consimțământul a fost retras — trimiterea este blocată." }, 403);
  }

  // Validate template if provided
  let resolvedTemplateId: string | null = templateId ?? null;
  if (templateId) {
    const tmpl = await db.query.messageTemplates.findFirst({
      where: and(eq(messageTemplates.id, templateId), eq(messageTemplates.tenantId, tenantId)),
    });
    if (!tmpl) return c.json({ error: "template_not_found" }, 404);
    resolvedTemplateId = tmpl.id;
  }

  // Build context for template rendering from lead fields
  const context: Record<string, string> = {
    first_name: lead.fullName.split(" ")[0] ?? lead.fullName,
    full_name: lead.fullName,
    phone: lead.phone ?? "",
    course: lead.interestCourse ?? "",
    center_name: "Vector Learn",
    trial_date: "",
  };

  // Provider stub: in dev we log; real integration (SendGrid/Twilio/360dialog) wired per channel
  // stub — no real send, just log interaction
  const metadata: Record<string, unknown> = { channel, stub: true };
  if (resolvedTemplateId) metadata.template_id = resolvedTemplateId;
  if (subject) metadata.subject = renderTemplate(subject, context);

  const [created] = await db
    .insert(leadInteractions)
    .values({
      tenantId,
      leadId: id,
      type: channel,
      direction: "outbound",
      body: renderTemplate(body, context),
      metadata,
      userId,
    })
    .returning();

  return c.json(created, 201);
});

// POST /api/leads/:id/log-call — log a phone call with outcome (CRM-109)
const logCallSchema = z.object({
  outcome: z.enum(["interested", "not_interested", "wrong_number", "no_answer"]),
  durationSeconds: z.number().int().min(0).max(7200).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

leadRoutes.post("/:id/log-call", zValidator("json", logCallSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const { outcome, durationSeconds, note } = c.req.valid("json");

  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);

  const OUTCOME_LABELS: Record<string, string> = {
    interested: "Interesat",
    not_interested: "Nu e interesat",
    wrong_number: "Număr greșit",
    no_answer: "Nu a răspuns",
  };

  const bodyParts: string[] = [`Apel ieșit — ${OUTCOME_LABELS[outcome] ?? outcome}`];
  if (durationSeconds != null && durationSeconds > 0) {
    const mins = Math.floor(durationSeconds / 60);
    const secs = durationSeconds % 60;
    bodyParts.push(`Durată: ${mins > 0 ? `${mins}m ` : ""}${secs}s`);
  }
  if (note?.trim()) bodyParts.push(note.trim());

  const metadata: Record<string, unknown> = { outcome };
  if (durationSeconds != null) metadata.duration_seconds = durationSeconds;
  metadata.recording_url = null; // placeholder — real recording integration deferred

  const [created] = await db
    .insert(leadInteractions)
    .values({
      tenantId,
      leadId: id,
      type: "call",
      direction: "outbound",
      body: bodyParts.join(" · "),
      metadata,
      userId,
    })
    .returning();

  return c.json(created, 201);
});

// DELETE /api/leads/:id — GDPR erasure (anonymize PII, keep audit trail)
leadRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;

  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);

  // Anonymize PII fields (GDPR erasure — keep record for audit, null out PII)
  await db
    .update(leads)
    .set({
      fullName: "[Șters GDPR]",
      phone: null,
      phoneNormalized: null,
      email: null,
      emailNormalized: null,
      notes: null,
      consentText: null,
      updatedAt: new Date(),
    })
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)));

  // Anonymize interaction bodies that may contain PII
  await db
    .update(leadInteractions)
    .set({ body: "[Șters GDPR]" })
    .where(and(eq(leadInteractions.leadId, id), eq(leadInteractions.tenantId, tenantId)));

  // Log the erasure
  await db.insert(leadInteractions).values({
    tenantId,
    leadId: id,
    type: "system",
    direction: "internal",
    body: `Date personale șterse (GDPR) de utilizatorul ${userId}`,
    userId,
  });

  return c.json({ deleted: true, anonymized: true });
});

