import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, count, desc, eq, gt, ilike, inArray, ne, or } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions, students, tenants, pipelineStages, leadTasks, messageTemplates, families, leadTags, cohorts, cohortParticipants } from "../db/schema";
import { renderTemplate } from "../db/schema/templates";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { normalizePhone, normalizeEmail } from "../lib/normalize";
import { fireTrigger } from "../lib/automationEngine";
import { createNotification, notifyManagersAndOwners } from "../lib/createNotification";
import { dispatchWebhook } from "../lib/webhookDispatch"; // INT-902
import { enrollLeadInCadences, pauseEnrollmentsOnReply } from "./cadences";
import { crmAuditLog } from "../db/schema";

// ─── CRM-127: Audit log helper ────────────────────────────────────────────────
async function auditLog(opts: {
  tenantId: string;
  actorId?: string | null;
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(crmAuditLog).values({
      tenantId: opts.tenantId,
      actorId: opts.actorId ?? null,
      entityId: opts.entityId,
      action: opts.action,
      beforeSnapshot: opts.before ?? null,
      afterSnapshot: opts.after ?? null,
    });
  } catch {
    // Never block the main operation due to audit failure
  }
}

// ─── CRM-127: Undo token store (in-memory, TTL 35s) ──────────────────────────
interface UndoEntry {
  leadIds: string[];
  snapshots: Record<string, unknown>[];
  expiresAt: number; // Date.now() + 35000
}
const undoStore = new Map<string, UndoEntry>();

function generateUndoToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function cleanExpiredTokens(): void {
  const now = Date.now();
  for (const [k, v] of undoStore) {
    if (v.expiresAt < now) undoStore.delete(k);
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
  assignedTo: z.string().uuid().optional().nullable(),
  /** CRM-113 */
  valueCents: z.number().int().min(0).default(0),
  debtCents: z.number().int().min(0).default(0),
  /** CRM-114 */
  company: z.string().max(300).optional().nullable(),
  dealName: z.string().max(300).optional().nullable(),
  /** CRM-141: initial stage for direct-to-column creation */
  stage: z.enum(STAGES).optional().default("new"),
  /** INTEG-101: FK to courses */
  courseId: z.string().uuid().optional().nullable(),
  /** INTEG-101: FK to branches (soft reference — FK constraint deferred) */
  branchId: z.string().uuid().optional().nullable(),
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
  /** INTEG-101 */
  courseId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
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
  /** CRM-117: list view pagination + sort */
  view: z.enum(["list", "pipeline"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(["fullName", "company", "stage", "source", "valueCents", "debtCents", "createdAt", "updatedAt"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  /** Shared filters */
  source: z.enum([...SOURCES, "all"]).default("all"),
  assignedTo: z.string().optional(),
  /** INTEG-101: branch filter */
  branchId: z.string().uuid().optional(),
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
  const { search, stage, view, page, pageSize, sort, dir, source: filterSource, assignedTo, branchId } = c.req.valid("query");
  const tenantId = c.get("user").tenantId;

  const conditions = [eq(leads.tenantId, tenantId)];
  if (stage !== "all") conditions.push(eq(leads.stage, stage));
  if (filterSource && filterSource !== "all") conditions.push(eq(leads.source, filterSource as typeof SOURCES[number]));
  /** INTEG-101: branch filter — only show leads from this branch */
  if (branchId) conditions.push(eq(leads.branchId, branchId));
  if (assignedTo && assignedTo !== "all") {
    if (assignedTo === "unassigned") {
      // filter unassigned leads — use isNull check via raw expression workaround
      conditions.push(eq(leads.assignedTo, null as unknown as string));
    } else {
      conditions.push(eq(leads.assignedTo, assignedTo));
    }
  }
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    // CRM-119: extended search covers company, deal_name, interest_course
    const searchCondition = or(
      ilike(leads.fullName, q),
      ilike(leads.email, q),
      ilike(leads.phone, q),
      ilike(leads.interestCourse, q),
      ilike(leads.company, q),
      ilike(leads.dealName, q)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  // CRM-117: list view with server-side pagination
  if (view === "list") {
    // Build sort expression
    const SORT_COLS = {
      fullName: leads.fullName,
      company: leads.company,
      stage: leads.stage,
      source: leads.source,
      valueCents: leads.valueCents,
      debtCents: leads.debtCents,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
    } as const;
    const sortCol = SORT_COLS[sort as keyof typeof SORT_COLS] ?? leads.createdAt;
    const orderExpr = dir === "asc" ? asc(sortCol) : desc(sortCol);

    const offset = (page - 1) * pageSize;

    // Total count (for pagination meta)
    const countResult = await db
      .select({ cnt: count(leads.id) })
      .from(leads)
      .where(and(...conditions));
    const totalRow = Array.isArray(countResult) ? countResult[0] : (countResult as { cnt: number }[])[0];
    const totalNum = Number(totalRow?.cnt ?? 0);

    const items = await db
      .select()
      .from(leads)
      .where(and(...conditions))
      .orderBy(orderExpr)
      .limit(pageSize)
      .offset(offset);

    // Augment with next open task per lead
    if (items.length > 0) {
      const leadIds = items.map((l) => l.id);
      const openTasks = await db
        .select()
        .from(leadTasks)
        .where(and(
          eq(leadTasks.tenantId, tenantId),
          eq(leadTasks.status, "open")
        ))
        .orderBy(asc(leadTasks.dueAt));

      const nextTaskMap: Record<string, { dueAt: Date | null; title: string } | undefined> = {};
      for (const task of openTasks) {
        if (leadIds.includes(task.leadId) && !nextTaskMap[task.leadId]) {
          nextTaskMap[task.leadId] = { dueAt: task.dueAt, title: task.title };
        }
      }

      const augmented = items.map((lead) => ({
        ...lead,
        nextTask: nextTaskMap[lead.id] ?? null,
      }));

      return c.json({
        items: augmented,
        page,
        pageSize,
        total: totalNum,
        totalPages: Math.ceil(totalNum / pageSize),
      });
    }

    return c.json({
      items: [],
      page,
      pageSize,
      total: 0,
      totalPages: 0,
    });
  }

  // Default: simple list (no pagination)
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

// CRM-150: POST /api/leads/import — bulk import from CSV (dryRun + commit)
const importRowSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  interestCourse: z.string().max(200).optional().nullable(),
  source: z.string().max(64).optional().nullable(),
  valueCents: z.number().int().min(0).optional(),
  company: z.string().max(300).optional().nullable(),
  tags: z.array(z.string().max(80)).optional(),
});

const importSchema = z.object({
  rows: z.array(importRowSchema).max(5000),
  dryRun: z.boolean().default(false),
});

leadRoutes.post("/import", zValidator("json", importSchema), async (c) => {
  const { rows, dryRun } = c.req.valid("json");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;

  let created = 0;
  let duplicates = 0;
  let errors = 0;

  // Resolve valid source values
  const validSources = new Set<string>(SOURCES);

  for (const row of rows) {
    if (!row.fullName?.trim()) { errors++; continue; }

    // Normalise contact info
    const phoneNorm = normalizePhone(row.phone ?? null);
    const emailNorm = normalizeEmail(row.email ?? null);

    // Dedup: same tenant + same phone OR email
    if (phoneNorm || emailNorm) {
      const existing = await db.query.leads.findFirst({
        where: and(
          eq(leads.tenantId, tenantId),
          or(
            phoneNorm ? eq(leads.phoneNormalized, phoneNorm) : undefined,
            emailNorm ? eq(leads.emailNormalized, emailNorm) : undefined
          )
        ),
        columns: { id: true },
      });
      if (existing) { duplicates++; continue; }
    }

    if (dryRun) { created++; continue; }

    try {
      const src = row.source && validSources.has(row.source)
        ? (row.source as typeof SOURCES[number])
        : "import";

      const [lead] = await db
        .insert(leads)
        .values({
          tenantId,
          fullName: row.fullName.trim(),
          phone: row.phone ?? null,
          phoneNormalized: phoneNorm,
          email: row.email ?? null,
          emailNormalized: emailNorm,
          interestCourse: row.interestCourse ?? null,
          source: src,
          valueCents: row.valueCents ?? 0,
          company: row.company ?? null,
          consentText: "CSV import",
          consentAt: new Date(),
        })
        .returning({ id: leads.id });

      if (!lead) { errors++; continue; }

      // Attach tags if provided (leadTags.tag is a varchar — no separate tags table)
      if (row.tags && row.tags.length > 0) {
        const tagValues = row.tags
          .map((t) => t.trim())
          .filter(Boolean)
          .map((tag) => ({ tenantId, leadId: lead.id, tag }));
        if (tagValues.length > 0) {
          await db.insert(leadTags).values(tagValues).onConflictDoNothing().catch(() => undefined);
        }
      }

      void auditLog({ tenantId, actorId: userId, entityId: lead.id, action: "lead.imported", after: { fullName: row.fullName } }).catch(() => undefined);
      created++;
    } catch {
      errors++;
    }
  }

  return c.json({ summary: { created, duplicates, errors } });
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
      /** CRM-141: honor initial stage (defaults to "new" via schema) */
      stage: (body.stage as typeof STAGES[number]) ?? "new",
      /** INTEG-101: course FK + branch */
      courseId: (body.courseId as string | null) ?? null,
      branchId: (body.branchId as string | null) ?? null,
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

  // INT-902: Dispatch outbound webhook for lead.created (fire-and-forget)
  void dispatchWebhook(tenantId, "lead.created", created as unknown as Record<string, unknown>).catch(() => undefined);

  // CRM-127: Audit log
  void auditLog({ tenantId, actorId: userId, entityId: created.id, action: "lead.created", after: created as unknown as Record<string, unknown> }).catch(() => undefined);

  // CRM-123: Notify assigned user (or all managers/admins if unassigned)
  const notifPayload = {
    type: "lead_created" as const,
    title: `Nou lead: ${created.fullName}`,
    body: created.interestCourse ? `Curs: ${created.interestCourse}` : undefined,
    link: `#/app/leads/${created.id}`,
    metadata: { leadId: created.id },
    tenantId,
  };
  if (created.assignedTo) {
    void createNotification({ ...notifPayload, userId: created.assignedTo }).catch(() => undefined);
  } else {
    void notifyManagersAndOwners(tenantId, notifPayload).catch(() => undefined);
  }

  return c.json(created, 201);
});

leadRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);

  // INTEG-101: augment with courseName
  let courseName: string | null = null;
  if (lead.courseId) {
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, lead.courseId),
      columns: { name: true },
    });
    courseName = course?.name ?? null;
  }

  return c.json({ ...lead, courseName });
});

leadRoutes.patch("/:id", zValidator("json", updateLeadSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const body = nullify(c.req.valid("json"));

  // CRM-127: Fetch before snapshot
  const before = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!before) return c.json({ error: "not_found" }, 404);

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

  // CRM-127: Audit log — only changed fields
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const k of Object.keys(body)) {
    changedBefore[k] = (before as unknown as Record<string, unknown>)[k];
    changedAfter[k] = (updated as unknown as Record<string, unknown>)[k];
  }
  void auditLog({ tenantId, actorId: userId, entityId: id, action: "lead.updated", before: changedBefore, after: changedAfter }).catch(() => undefined);

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
    // CRM-126: Auto-enroll in matching cadences
    void enrollLeadInCadences(tenantId, id, stage).catch(() => undefined);
    // CRM-127: Audit log
    void auditLog({
      tenantId, actorId: userId, entityId: id, action: "lead.stage_changed",
      before: { stage: lead.stage },
      after: { stage },
    }).catch(() => undefined);
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

  // INTEG-201: Auto-enroll in cohort if lead has courseId set
  let autoEnrolledCohortId: string | null = null;
  if (lead.courseId) {
    try {
      // Find the next upcoming or active cohort for this course
      const today = new Date().toISOString().slice(0, 10);
      const candidateCohorts = await db
        .select()
        .from(cohorts)
        .where(
          and(
            eq(cohorts.tenantId, tenantId),
            eq(cohorts.courseId, lead.courseId),
            // Only upcoming or active cohorts (startDate >= today OR already started but not past)
            // We pick all and filter by category in JS to avoid complex SQL
          )
        )
        .orderBy(asc(cohorts.startDate));

      const eligible = (Array.isArray(candidateCohorts) ? candidateCohorts : []).filter((coh) => {
        // A cohort is eligible if it's not in the past (startDate <= today is fine for "active";
        // only skip if it ended — we check endDate via manualEndDate or default 56-day window)
        const manualEnd = coh.manualEndDate;
        const estimatedEnd = manualEnd
          ? manualEnd
          : (() => {
              const totalSessions = Math.ceil(coh.totalHours / coh.hoursPerSession);
              const daysNeeded = totalSessions * 3; // rough estimate: 3 days between sessions
              const d = new Date(coh.startDate);
              d.setDate(d.getDate() + daysNeeded);
              return d.toISOString().slice(0, 10);
            })();
        // Include if cohort hasn't ended yet
        return estimatedEnd >= today;
      });

      const targetCohort = eligible[0] ?? null;

      if (targetCohort) {
        await db.insert(cohortParticipants).values({
          tenantId,
          cohortId: targetCohort.id,
          studentId: student.id,
          fullName: student.fullName,
          email: student.email ?? null,
          phone: student.phone ?? null,
          source: "crm",
          paymentStatus: "pending",
          amountCents: 0,
        });
        autoEnrolledCohortId = targetCohort.id;
      }
    } catch {
      // Auto-enroll failure must NOT block conversion — log silently
    }
  }

  // CRM-123: Notify about conversion
  void notifyManagersAndOwners(tenantId, {
    type: "lead_converted",
    title: `Lead convertit: ${lead.fullName}`,
    body: `Acum este student activ${autoEnrolledCohortId ? " (înscris în cohortă)" : ""}`,
    link: `#/app/leads/${id}`,
    metadata: { leadId: id, studentId: student.id, cohortId: autoEnrolledCohortId },
    isRead: false,
  }).catch(() => undefined);

  const updatedLead = { ...lead, convertedToStudentId: student.id, stage: "paid" as const };
  return c.json({ lead: updatedLead, student, familyId, autoEnrolledCohortId });
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

  // CRM-126: Auto-pause cadence enrollments when lead replies
  if (body.direction === "inbound") {
    void pauseEnrollmentsOnReply(tenantId, id).catch(() => undefined);
  }

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

// POST /api/leads/:id/score — calculate and save lead score (CRM-111, CRM-145: +factors)
leadRoutes.post("/:id/score", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);

  // Score algorithm: signals that increase priority
  // CRM-145: collect factors for explainer UI
  const factors: Array<{ label: string; points: number }> = [];
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
  const sourcePoints = sourceScores[lead.source] ?? 10;
  score += sourcePoints;
  const sourceLabels: Record<string, string> = {
    webform: "Formular web",
    facebook_ad: "Facebook Ads",
    google_ads: "Google Ads",
    phone_in: "Apel intrare",
    referral: "Recomandare",
    instagram: "Instagram",
    manual: "Manual",
    import: "Import",
    other: "Altul",
  };
  factors.push({ label: `Sursă: ${sourceLabels[lead.source] ?? lead.source}`, points: sourcePoints });

  // Stage signal
  const stageScores: Record<string, number> = {
    new: 10,
    contacted: 25,
    trial: 45,
    paid: 100,
    lost: 0,
  };
  const stagePoints = stageScores[lead.stage] ?? 10;
  score += stagePoints;
  const stageLabels: Record<string, string> = {
    new: "Nou",
    contacted: "Contactat",
    trial: "Trial",
    paid: "Plătit",
    lost: "Pierdut",
  };
  factors.push({ label: `Stadiu: ${stageLabels[lead.stage] ?? lead.stage}`, points: stagePoints });

  // Has email
  if (lead.email) { score += 10; factors.push({ label: "Are email", points: 10 }); }
  // Has phone
  if (lead.phone) { score += 10; factors.push({ label: "Are telefon", points: 10 }); }
  // Has course interest
  if (lead.interestCourse) { score += 5; factors.push({ label: "Curs dorit specificat", points: 5 }); }

  // Cap at 100
  score = Math.min(score, 100);

  const [updated] = await db
    .update(leads)
    .set({ score, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)))
    .returning();

  const badge = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  return c.json({ lead: updated, score, badge, factors });
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

// ─── CRM-118: Bulk-action endpoint ───────────────────────────────────────────
const bulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  action: z.enum(["stage", "assign", "tag", "delete"]),
  payload: z.object({
    stage: z.string().min(1).max(64).optional(),
    lostReason: z.string().max(500).optional().nullable(),
    assignedTo: z.string().uuid().optional().nullable(),
    tag: z.string().min(1).max(100).optional(),
  }).optional(),
});

leadRoutes.post("/bulk-action", zValidator("json", bulkActionSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const { ids, action, payload } = c.req.valid("json");

  // Fetch only leads that belong to this tenant
  const ownedLeads = await db
    .select({ id: leads.id, stage: leads.stage, gclid: leads.gclid })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), inArray(leads.id, ids)));

  const ownedIds = ownedLeads.map((l) => l.id);
  const skipped = ids.length - ownedIds.length;

  if (ownedIds.length === 0) {
    return c.json({ processed: 0, failed: skipped, errors: ["No leads found for this tenant"] });
  }

  let processed = 0;
  const errors: string[] = [];

  if (action === "stage") {
    const newStage = payload?.stage;
    if (!newStage) return c.json({ error: "stage required" }, 400);

    // Validate stage exists
    const targetStage = await db.query.pipelineStages.findFirst({
      where: and(eq(pipelineStages.tenantId, tenantId), eq(pipelineStages.key, newStage)),
    });
    const DEFAULT_KEYS = ["new", "contacted", "trial", "paid", "lost"];
    const isLostStage = targetStage?.isLost ?? newStage === "lost";

    if (isLostStage && !payload?.lostReason) {
      return c.json({ error: "lost_reason_required" }, 400);
    }

    const patch: Record<string, unknown> = { stage: newStage, updatedAt: new Date() };
    if (isLostStage) patch.lostReason = payload?.lostReason ?? null;

    // Validate stage key
    if (!targetStage && !DEFAULT_KEYS.includes(newStage)) {
      return c.json({ error: "invalid_stage" }, 400);
    }

    await db.update(leads).set(patch).where(and(eq(leads.tenantId, tenantId), inArray(leads.id, ownedIds)));

    // Audit interactions
    const interactionRows = ownedLeads.map((l) => ({
      tenantId,
      leadId: l.id,
      type: "system" as const,
      direction: "internal" as const,
      body: `Bulk: stadiu schimbat → ${newStage}${isLostStage && payload?.lostReason ? ` (${payload.lostReason})` : ""}`,
      userId,
    }));
    if (interactionRows.length > 0) await db.insert(leadInteractions).values(interactionRows);
    processed = ownedIds.length;

  } else if (action === "assign") {
    const assignedTo = payload?.assignedTo ?? null;
    await db.update(leads).set({ assignedTo, updatedAt: new Date() }).where(and(eq(leads.tenantId, tenantId), inArray(leads.id, ownedIds)));

    const interactionRows = ownedLeads.map((l) => ({
      tenantId,
      leadId: l.id,
      type: "system" as const,
      direction: "internal" as const,
      body: assignedTo ? `Bulk: reasignat către ${assignedTo}` : "Bulk: responsabil eliminat",
      userId,
    }));
    if (interactionRows.length > 0) await db.insert(leadInteractions).values(interactionRows);
    processed = ownedIds.length;

  } else if (action === "tag") {
    const tag = payload?.tag?.trim();
    if (!tag) return c.json({ error: "tag required" }, 400);

    // Insert tags, ignore conflicts (tag already exists for that lead)
    for (const leadId of ownedIds) {
      try {
        await db.insert(leadTags).values({ tenantId, leadId, tag }).onConflictDoNothing();
        processed++;
      } catch {
        errors.push(`Could not add tag to lead ${leadId}`);
      }
    }

    const interactionRows = ownedIds.map((leadId) => ({
      tenantId,
      leadId,
      type: "system" as const,
      direction: "internal" as const,
      body: `Bulk: tag „${tag}" adăugat`,
      userId,
    }));
    if (interactionRows.length > 0) await db.insert(leadInteractions).values(interactionRows);

  } else if (action === "delete") {
    // GDPR erasure — anonymize PII, keep audit trail
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
      .where(and(eq(leads.tenantId, tenantId), inArray(leads.id, ownedIds)));

    await db
      .update(leadInteractions)
      .set({ body: "[Șters GDPR]" })
      .where(and(eq(leadInteractions.tenantId, tenantId), inArray(leadInteractions.leadId, ownedIds)));

    const erasureRows = ownedIds.map((leadId) => ({
      tenantId,
      leadId,
      type: "system" as const,
      direction: "internal" as const,
      body: `Date personale șterse în masă (GDPR) de utilizatorul ${userId}`,
      userId,
    }));
    if (erasureRows.length > 0) await db.insert(leadInteractions).values(erasureRows);
    processed = ownedIds.length;
  }

  return c.json({ processed, failed: skipped + (ownedIds.length - processed), errors: errors.length > 0 ? errors : undefined });
});

// CRM-127: POST /api/leads/:id/crm-delete — soft CRM delete with undo token
leadRoutes.post("/:id/crm-delete", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;

  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  if (!lead) return c.json({ error: "not_found" }, 404);

  // Hard delete the lead (CRM delete — not GDPR erasure)
  await db
    .delete(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)));

  // CRM-127: Audit log
  void auditLog({
    tenantId, actorId: userId, entityId: id, action: "lead.deleted",
    before: lead as unknown as Record<string, unknown>,
  }).catch(() => undefined);

  // Store undo token (35s TTL)
  cleanExpiredTokens();
  const token = generateUndoToken();
  const expiresAt = Date.now() + 35_000;
  undoStore.set(token, {
    leadIds: [id],
    snapshots: [lead as unknown as Record<string, unknown>],
    expiresAt,
  });

  return c.json({
    deleted: true,
    undoToken: token,
    expiresAt: new Date(expiresAt).toISOString(),
  });
});

// CRM-127: POST /api/leads/undo/:token — restore deleted lead
leadRoutes.post("/undo/:token", async (c) => {
  const token = c.req.param("token");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;

  cleanExpiredTokens();
  const entry = undoStore.get(token);
  if (!entry) return c.json({ error: "undo_token_expired_or_invalid" }, 410);
  if (entry.expiresAt < Date.now()) {
    undoStore.delete(token);
    return c.json({ error: "undo_token_expired_or_invalid" }, 410);
  }

  undoStore.delete(token);

  const restoredIds: string[] = [];
  for (const snapshot of entry.snapshots) {
    // Re-insert lead from snapshot (pick only known columns)
    const snap = snapshot as Record<string, unknown>;
    if (snap.tenantId !== tenantId) continue; // safety: never restore cross-tenant

    try {
      // Type-safe insert — extract known fields
      const [restored] = await db
        .insert(leads)
        .values({
          id: snap.id as string,
          tenantId: snap.tenantId as string,
          fullName: (snap.fullName as string) ?? "Restaurat",
          phone: (snap.phone as string | null) ?? null,
          phoneNormalized: (snap.phoneNormalized as string | null) ?? null,
          email: (snap.email as string | null) ?? null,
          emailNormalized: (snap.emailNormalized as string | null) ?? null,
          interestCourse: (snap.interestCourse as string | null) ?? null,
          stage: (snap.stage as "new" | "contacted" | "trial" | "paid" | "lost") ?? "new",
          source: (snap.source as "manual") ?? "manual",
          notes: (snap.notes as string | null) ?? null,
          assignedTo: (snap.assignedTo as string | null) ?? null,
          valueCents: (snap.valueCents as number) ?? 0,
          debtCents: (snap.debtCents as number) ?? 0,
          company: (snap.company as string | null) ?? null,
          dealName: (snap.dealName as string | null) ?? null,
          createdAt: snap.createdAt ? new Date(snap.createdAt as string) : new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (restored) {
        restoredIds.push(restored.id);
        void auditLog({ tenantId, actorId: userId, entityId: restored.id, action: "lead.restored", after: restored as unknown as Record<string, unknown> }).catch(() => undefined);
      }
    } catch {
      // If ID conflicts (somehow not deleted), skip
    }
  }

  return c.json({ restored: true, leadIds: restoredIds });
});

// ─── CRM-133: Duplicate detection banner — GET /dedup-banner ─────────────────
// Returns potential duplicates for the given phone/email, excluding the current lead.
// Used by LeadCardPage on mount to show a banner if duplicates exist.

const dedupBannerSchema = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
  excludeId: z.string().uuid().optional(),
});

leadRoutes.get("/dedup-banner", zValidator("query", dedupBannerSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { phone, email, excludeId } = c.req.valid("query");

  const phoneNormalized = normalizePhone(phone ?? null);
  const emailNormalized = normalizeEmail(email ?? null);

  if (!phoneNormalized && !emailNormalized) {
    return c.json({ duplicates: [] });
  }

  const conditions = [eq(leads.tenantId, tenantId)];
  const orConds: ReturnType<typeof eq>[] = [];
  if (phoneNormalized) orConds.push(eq(leads.phoneNormalized, phoneNormalized));
  if (emailNormalized) orConds.push(eq(leads.emailNormalized, emailNormalized));
  if (orConds.length > 0) conditions.push(or(...orConds)!);
  if (excludeId) conditions.push(ne(leads.id, excludeId));

  // Exclude already-converted leads and "lost" leads with mergedReason
  const found = await db.query.leads.findMany({
    where: and(...conditions),
    limit: 5,
    orderBy: [desc(leads.createdAt)],
  });

  // Filter out leads already converted
  const duplicates = found.filter((l) => !l.convertedToStudentId);

  return c.json({ duplicates });
});

// ─── CRM-133: Merge leads — POST /:id/merge ────────────────────────────────
// Merges two leads: copies interactions + tasks from the source into the target,
// then marks the source as lost (stage=lost, lostReason="merged").
// keepId = the lead to keep; the other lead is archived (marked lost).

const mergeLeadSchema = z.object({
  mergeWithId: z.string().uuid(),
  keepId: z.string().uuid(),
});

leadRoutes.post("/:id/merge", zValidator("json", mergeLeadSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;
  const { mergeWithId, keepId } = c.req.valid("json");

  // Validate that both leads belong to this tenant
  const leadA = await db.query.leads.findFirst({
    where: and(eq(leads.id, id), eq(leads.tenantId, tenantId)),
  });
  const leadB = await db.query.leads.findFirst({
    where: and(eq(leads.id, mergeWithId), eq(leads.tenantId, tenantId)),
  });

  if (!leadA) return c.json({ error: "lead_not_found" }, 404);
  if (!leadB) return c.json({ error: "merge_target_not_found" }, 404);

  // Validate keepId is one of the two leads
  if (keepId !== id && keepId !== mergeWithId) {
    return c.json({ error: "keepId_must_be_one_of_the_two_leads" }, 400);
  }

  const archiveId = keepId === id ? mergeWithId : id;

  // Copy interactions from archived lead to kept lead (update leadId)
  await db
    .update(leadInteractions)
    .set({ leadId: keepId })
    .where(and(eq(leadInteractions.leadId, archiveId), eq(leadInteractions.tenantId, tenantId)));

  // Copy tasks from archived lead to kept lead
  await db
    .update(leadTasks)
    .set({ leadId: keepId })
    .where(and(eq(leadTasks.leadId, archiveId), eq(leadTasks.tenantId, tenantId)));

  // Log merge event on the kept lead
  await db.insert(leadInteractions).values({
    tenantId,
    leadId: keepId,
    type: "system",
    direction: "internal",
    body: `Lead fuzionat cu ${archiveId} de utilizatorul ${userId}. Lead arhivat: ${archiveId}.`,
    userId,
  });

  // Archive the source lead (mark as lost with lostReason "merged")
  await db
    .update(leads)
    .set({ stage: "lost", lostReason: "merged", updatedAt: new Date() })
    .where(and(eq(leads.id, archiveId), eq(leads.tenantId, tenantId)));

  // Return the kept lead
  const keptLead = await db.query.leads.findFirst({
    where: and(eq(leads.id, keepId), eq(leads.tenantId, tenantId)),
  });

  return c.json({ merged: true, keptLead });
});

