/**
 * CRM-110 — Automations CRUD + test mode + cron no_contact
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { automations, automationRuns, leads, leadInteractions } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { runAutomation } from "../lib/automationEngine";

export const automationRoutes = new Hono<{ Variables: AuthVariables }>();

automationRoutes.use("/*", requireAuth);

// ─── Schemas ──────────────────────────────────────────────────────────────────

const conditionSchema = z.object({
  field: z.string().min(1).max(64),
  op: z.enum(["eq", "neq", "contains", "gte", "lte", "exists", "not_exists"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

const triggerSchema = z.object({
  event: z.enum(["lead.created", "lead.stage_changed", "time.no_contact"]),
  params: z.record(z.unknown()).optional(),
});

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("send_template"),
    params: z.object({
      templateId: z.string().uuid(),
      channel: z.enum(["email", "whatsapp", "sms"]),
    }),
  }),
  z.object({
    type: z.literal("create_task"),
    params: z.object({
      title: z.string().min(1).max(300),
      dueDays: z.number().int().min(0).max(365).optional(),
    }),
  }),
  z.object({
    type: z.literal("assign"),
    params: z.object({ userId: z.string().uuid() }),
  }),
  z.object({
    type: z.literal("move_stage"),
    params: z.object({ stage: z.string().min(1).max(64) }),
  }),
]);

const createAutomationSchema = z.object({
  name: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1, "At least one action required"),
});

const updateAutomationSchema = createAutomationSchema.partial();

// ─── CRUD routes ──────────────────────────────────────────────────────────────

// GET /api/automations — list all for tenant
automationRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const items = await db
    .select()
    .from(automations)
    .where(eq(automations.tenantId, tenantId))
    .orderBy(desc(automations.createdAt));

  return c.json({ items });
});

// GET /api/automations/:id — single
automationRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const auto = await db.query.automations.findFirst({
    where: and(eq(automations.id, id), eq(automations.tenantId, tenantId)),
  });
  if (!auto) return c.json({ error: "not_found" }, 404);
  return c.json(auto);
});

// POST /api/automations — create
automationRoutes.post("/", zValidator("json", createAutomationSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const [created] = await db
    .insert(automations)
    .values({
      tenantId,
      name: body.name,
      enabled: body.enabled,
      trigger: body.trigger,
      conditions: body.conditions,
      actions: body.actions,
    })
    .returning();

  return c.json(created, 201);
});

// PATCH /api/automations/:id — update
automationRoutes.patch("/:id", zValidator("json", updateAutomationSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) patch.name = body.name;
  if (body.enabled !== undefined) patch.enabled = body.enabled;
  if (body.trigger !== undefined) patch.trigger = body.trigger;
  if (body.conditions !== undefined) patch.conditions = body.conditions;
  if (body.actions !== undefined) patch.actions = body.actions;

  const [updated] = await db
    .update(automations)
    .set(patch)
    .where(and(eq(automations.id, id), eq(automations.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

// DELETE /api/automations/:id
automationRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  await db
    .delete(automations)
    .where(and(eq(automations.id, id), eq(automations.tenantId, tenantId)));

  return c.json({ deleted: true });
});

// ─── Runs (audit log) ─────────────────────────────────────────────────────────

// GET /api/automations/:id/runs — audit log for an automation
automationRoutes.get("/:id/runs", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  // Verify automation belongs to tenant
  const auto = await db.query.automations.findFirst({
    where: and(eq(automations.id, id), eq(automations.tenantId, tenantId)),
  });
  if (!auto) return c.json({ error: "not_found" }, 404);

  const items = await db
    .select()
    .from(automationRuns)
    .where(and(eq(automationRuns.automationId, id), eq(automationRuns.tenantId, tenantId)))
    .orderBy(desc(automationRuns.ranAt))
    .limit(100);

  return c.json({ items });
});

// ─── Test mode ────────────────────────────────────────────────────────────────

// POST /api/automations/:id/test — simulate on a real or fictitious lead
automationRoutes.post("/:id/test", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const auto = await db.query.automations.findFirst({
    where: and(eq(automations.id, id), eq(automations.tenantId, tenantId)),
  });
  if (!auto) return c.json({ error: "not_found" }, 404);

  // Build a fictitious lead for dry-run
  const fictitiousLead = {
    id: "00000000-0000-0000-0000-000000000000",
    tenantId,
    fullName: "Lead de Test",
    phone: "+40799000000",
    phoneNormalized: "+40799000000",
    email: "test@vectorlearn.ro",
    emailNormalized: "test@vectorlearn.ro",
    interestCourse: "Curs demo",
    stage: "new" as const,
    source: "manual" as const,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    fbclid: null,
    gclid: null,
    consentText: "Consimțământ test",
    consentAt: new Date(),
    ipAtConsent: null,
    notes: null,
    assignedTo: null,
    consentRevokedAt: null,
    lostReason: null,
    convertedToStudentId: null,
    convertedAt: null,
    // CRM-111/113 fields added later
    company: null,
    valueCents: 0,
    debtCents: 0,
    dealName: null,
    score: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await runAutomation(auto, fictitiousLead, { dryRun: true });
  return c.json(result);
});

// ─── Cron: no_contact trigger ─────────────────────────────────────────────────

// POST /api/automations/cron/no-contact — called by a cron job (or manually)
// Finds all enabled time.no_contact automations, checks leads with no recent interaction
automationRoutes.post("/cron/no-contact", async (c) => {
  // This endpoint is called by a cron job; in production, protect with a secret header
  const tenantId = c.get("user").tenantId;

  // Find enabled time.no_contact automations for this tenant
  const allAutos = await db
    .select()
    .from(automations)
    .where(and(eq(automations.tenantId, tenantId), eq(automations.enabled, true)));

  const noContactAutos = allAutos.filter((a) => {
    const trigger = a.trigger as { event: string; params?: { days?: number } };
    return trigger.event === "time.no_contact";
  });

  if (noContactAutos.length === 0) {
    return c.json({ processed: 0, results: [] });
  }

  // For each automation, determine the no_contact threshold
  const results: { automationId: string; leadId: string; status: string }[] = [];

  for (const auto of noContactAutos) {
    const trigger = auto.trigger as { event: string; params?: { days?: number } };
    const days = trigger.params?.days ?? 3;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Find leads for this tenant that are not lost/paid and have no interaction since cutoff
    const tenantLeads = await db
      .select()
      .from(leads)
      .where(
        and(
          eq(leads.tenantId, tenantId)
        )
      );

    for (const lead of tenantLeads) {
      if (lead.stage === "paid" || lead.stage === "lost") continue;

      // Check last interaction date
      const lastInteraction = await db
        .select()
        .from(leadInteractions)
        .where(
          and(
            eq(leadInteractions.leadId, lead.id),
            eq(leadInteractions.tenantId, tenantId)
          )
        )
        .orderBy(desc(leadInteractions.occurredAt))
        .limit(1);

      const r = Array.isArray(lastInteraction) ? lastInteraction : [];
      const lastAt = r[0]?.occurredAt ?? lead.createdAt;

      if (new Date(lastAt) < cutoff) {
        const runResult = await runAutomation(auto, lead, { dryRun: false });
        results.push({
          automationId: auto.id,
          leadId: lead.id,
          status: runResult.status,
        });
      }
    }
  }

  return c.json({ processed: results.length, results });
});
