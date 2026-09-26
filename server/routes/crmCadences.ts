/**
 * CRM Faza 9 — cadențe și reactivare.
 *
 * Montat la /api/crm/cadences.
 *
 * GET    /api/crm/cadences                  — cadențele workspace-ului
 * POST   /api/crm/cadences                  — cadență nouă (pași: {dayOffset, action, title})
 * PATCH  /api/crm/cadences/:id              — nume / pași / pornit-oprit / etapa declanșatoare
 * DELETE /api/crm/cadences/:id              — cadența + înscrierile ei (cascade)
 * GET    /api/crm/cadences/enrollments?leadId= — înscrierile unui lead
 * POST   /api/crm/cadences/enroll           — înscrie un lead
 * POST   /api/crm/cadences/enrollments/:id/cancel — oprește o înscriere
 * POST   /api/crm/cadences/run              — aprinde acum pașii scadenți AI TĂI (buton de test)
 *
 * GET    /api/crm/cadences/reengagement/rules      — regulile de reactivare
 * POST   /api/crm/cadences/reengagement/rules      — regulă nouă
 * PATCH  /api/crm/cadences/reengagement/rules/:id  — editare
 * DELETE /api/crm/cadences/reengagement/rules/:id  — ștergere
 * GET    /api/crm/cadences/reengagement/preview    — ce s-ar trezi acum, FĂRĂ efecte
 * POST   /api/crm/cadences/reengagement/run        — aplică efectiv
 *
 * Drepturi: crearea/editarea cadențelor și a regulilor cere `cadences.manage`; înscrierea unui
 * lead într-o cadență existentă cere doar `leads.edit` — e munca agentului, nu administrare.
 *
 * Preview-ul există dinadins ca rută separată: reactivarea atinge clienți pierduți, iar un buton
 * care aplică direct, fără să arate pe cine, e un mod bun de a trimite 300 de taskuri din greșeală.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  crmCadences,
  crmCadenceEnrollments,
  crmReengagementRules,
  crmReengagementRuns,
  type NewCrmCadence,
  type NewCrmReengagementRule,
} from "../db/schema/crmCadences";
import { leads } from "../db/schema/leads";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import { enrollLeadInCadence, findActiveEnrollment, processDueEnrollments } from "../lib/crm/cadences";
import { previewDueReengagements, runReengagement } from "../lib/crm/reengagement";
import { logCrmAudit } from "../lib/crm/audit";

export const crmCadencesRoutes = new Hono<{ Variables: AuthVariables }>();
crmCadencesRoutes.use("/*", requireAuth);

/**
 * Poarta e per rută, nu una singură peste toate metodele. Prima variantă (un `post("/*")` cu
 * `cadences.manage`) tăia și înscrierea unui lead — iar asta nu e administrare, e munca de zi cu
 * zi a agentului: cadența e deja făcută de altcineva, el doar bagă clientul în ea. Cu poarta
 * largă, un agent nu-și putea urmări propriul lead.
 *
 * Deci: A CONSTRUI o cadență sau o regulă de reactivare (și a le porni pe tot workspace-ul) cere
 * `cadences.manage`; A ÎNSCRIE sau a opri un lead cere doar `leads.edit`.
 */
const manageCadences = requireCrmPermission("cadences.manage");
const editLeads = requireCrmPermission("leads.edit");

const stepSchema = z.object({
  dayOffset: z.number().int().min(0).max(365),
  action: z.enum(["task", "note"]),
  title: z.string().trim().min(1).max(300),
});

const createCadenceSchema = z.object({
  name: z.string().trim().min(1, "Numele cadenței este obligatoriu").max(200),
  triggerStage: z.string().max(64).optional().nullable(),
  enabled: z.boolean().optional(),
  steps: z.array(stepSchema).max(20).optional(),
});

const updateCadenceSchema = createCadenceSchema.partial();

const ruleSchema = z.object({
  name: z.string().trim().min(1, "Numele regulii este obligatoriu").max(200),
  enabled: z.boolean().optional(),
  afterMonths: z.number().int().min(1).max(60),
  lostReasons: z.array(z.string().max(500)).max(20).optional(),
  stageKeys: z.array(z.string().max(64)).max(20).optional(),
  action: z.enum(["create_task", "enroll_cadence", "add_tag"]),
  cadenceId: z.string().uuid().optional().nullable(),
  taskTitle: z.string().trim().max(300).optional().nullable(),
});

const updateRuleSchema = ruleSchema.partial();

/**
 * „Înscrie în cadență” fără cadență e o regulă care nu poate rula niciodată: reactivarea o sare
 * în tăcere, iar managerul crede că clienții pierduți sunt urmăriți. Refuzul are forma unei
 * erori zod (ca restul validărilor rutei), ca ecranul să afișeze mesajul, nu un cod.
 */
const CADENCE_REQUIRED = {
  success: false,
  error: {
    name: "ZodError",
    issues: [{ code: "custom", path: ["cadenceId"], message: "Alege cadența în care se înscriu clienții." }],
  },
} as const;

/** Cadența aleasă trebuie să fie a ACESTUI workspace — la creare ȘI la editare. */
async function ownsCadence(tenantId: string, cadenceId: string): Promise<boolean> {
  const [cadence] = await db
    .select({ id: crmCadences.id })
    .from(crmCadences)
    .where(and(eq(crmCadences.id, cadenceId), eq(crmCadences.tenantId, tenantId)));
  return !!cadence;
}

// ─── Reactivare (ÎNAINTE de /:id — „reengagement" nu e un identificator) ─────

crmCadencesRoutes.get("/reengagement/rules", async (c) => {
  const user = c.get("user");
  try {
    const items = await db
      .select()
      .from(crmReengagementRules)
      .where(eq(crmReengagementRules.tenantId, user.tenantId))
      .orderBy(asc(crmReengagementRules.orderIndex));
    return c.json({ items });
  } catch (e) {
    console.error("[crm/reengagement] listare eșuată:", e instanceof Error ? e.message : e);
    return c.json({ items: [], schemaLag: true });
  }
});

crmCadencesRoutes.post("/reengagement/rules", manageCadences, zValidator("json", ruleSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  if (body.action === "enroll_cadence" && !body.cadenceId) return c.json(CADENCE_REQUIRED, 400);

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${crmReengagementRules.orderIndex}), -1)::int` })
    .from(crmReengagementRules)
    .where(eq(crmReengagementRules.tenantId, user.tenantId));

  const values: NewCrmReengagementRule = {
    tenantId: user.tenantId,
    name: body.name,
    afterMonths: body.afterMonths,
    action: body.action,
    orderIndex: (maxOrder ?? -1) + 1,
  };
  if (body.enabled !== undefined) values.enabled = body.enabled;
  if (body.lostReasons !== undefined) values.lostReasons = body.lostReasons;
  if (body.stageKeys !== undefined) values.stageKeys = body.stageKeys;
  if (body.taskTitle !== undefined) values.taskTitle = body.taskTitle;
  // O cadență din alt workspace n-are ce căuta pe regula asta.
  if (body.cadenceId) {
    if (!(await ownsCadence(user.tenantId, body.cadenceId))) return c.json({ error: "not_found" }, 404);
    values.cadenceId = body.cadenceId;
  }

  const [row] = await db.insert(crmReengagementRules).values(values).returning();

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "reengagement_rule.created",
    target: "crm_reengagement_rule",
    targetId: row.id,
    after: { name: row.name, afterMonths: row.afterMonths, action: row.action },
  });

  return c.json(row, 201);
});

crmCadencesRoutes.patch("/reengagement/rules/:id", manageCadences, zValidator("json", updateRuleSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [current] = await db
    .select({ action: crmReengagementRules.action, cadenceId: crmReengagementRules.cadenceId })
    .from(crmReengagementRules)
    .where(and(eq(crmReengagementRules.id, id), eq(crmReengagementRules.tenantId, user.tenantId)));
  if (!current) return c.json({ error: "not_found" }, 404);
  // Aceleași reguli ca la creare. Fără ele, editarea era ușa din spate: POST refuza cadența
  // altui client cu 404, iar PATCH o lega cu 200 — și reactivarea înscria clienții noștri în ea.
  if (body.cadenceId && !(await ownsCadence(user.tenantId, body.cadenceId))) {
    return c.json({ error: "not_found" }, 404);
  }
  const nextAction = body.action ?? current.action;
  const nextCadenceId = body.cadenceId !== undefined ? body.cadenceId : current.cadenceId;
  if (nextAction === "enroll_cadence" && !nextCadenceId) return c.json(CADENCE_REQUIRED, 400);

  const updates: Partial<NewCrmReengagementRule> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.afterMonths !== undefined) updates.afterMonths = body.afterMonths;
  if (body.lostReasons !== undefined) updates.lostReasons = body.lostReasons;
  if (body.stageKeys !== undefined) updates.stageKeys = body.stageKeys;
  if (body.action !== undefined) updates.action = body.action;
  if (body.taskTitle !== undefined) updates.taskTitle = body.taskTitle;
  if (body.cadenceId !== undefined) updates.cadenceId = body.cadenceId;

  const [row] = await db
    .update(crmReengagementRules)
    .set(updates)
    .where(and(eq(crmReengagementRules.id, id), eq(crmReengagementRules.tenantId, user.tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "reengagement_rule.updated",
    target: "crm_reengagement_rule",
    targetId: id,
    after: body,
  });

  return c.json(row);
});

crmCadencesRoutes.delete("/reengagement/rules/:id", manageCadences, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [deleted] = await db
    .delete(crmReengagementRules)
    .where(and(eq(crmReengagementRules.id, id), eq(crmReengagementRules.tenantId, user.tenantId)))
    .returning();
  if (!deleted) return c.json({ error: "not_found" }, 404);

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "reengagement_rule.deleted",
    target: "crm_reengagement_rule",
    targetId: id,
    before: { name: deleted.name },
  });

  return c.json({ ok: true });
});

/** Ce s-ar trezi acum — fără niciun efect. */
crmCadencesRoutes.get("/reengagement/preview", async (c) => {
  const user = c.get("user");
  const due = await previewDueReengagements(user.tenantId);
  const leadIds = due.map((d) => d.lead.id);
  const names =
    leadIds.length > 0
      ? await db
          .select({ id: leads.id, fullName: leads.fullName, dealName: leads.dealName })
          .from(leads)
          .where(and(eq(leads.tenantId, user.tenantId), inArray(leads.id, leadIds)))
      : [];
  const nameById = Object.fromEntries(names.map((n) => [n.id, n.dealName || n.fullName]));

  return c.json({
    items: due.map((d) => ({
      ruleId: d.rule.id,
      ruleName: d.rule.name,
      action: d.rule.action,
      leadId: d.lead.id,
      leadName: nameById[d.lead.id] ?? "(lead)",
      lostAt: d.lead.lostAt,
      lostReason: d.lead.lostReason,
    })),
  });
});

crmCadencesRoutes.post("/reengagement/run", manageCadences, async (c) => {
  const user = c.get("user");
  const result = await runReengagement(user.tenantId);
  return c.json({ ok: true, ...result });
});

// ─── Înscrieri ────────────────────────────────────────────────────────────────

crmCadencesRoutes.get("/enrollments", async (c) => {
  const user = c.get("user");
  const leadId = c.req.query("leadId");
  if (!leadId) return c.json({ error: "lead_id_required" }, 400);

  try {
    const items = await db
      .select({
        id: crmCadenceEnrollments.id,
        leadId: crmCadenceEnrollments.leadId,
        cadenceId: crmCadenceEnrollments.cadenceId,
        status: crmCadenceEnrollments.status,
        currentStep: crmCadenceEnrollments.currentStep,
        nextFireAt: crmCadenceEnrollments.nextFireAt,
        enrolledAt: crmCadenceEnrollments.enrolledAt,
        cadenceName: crmCadences.name,
      })
      .from(crmCadenceEnrollments)
      .innerJoin(crmCadences, eq(crmCadences.id, crmCadenceEnrollments.cadenceId))
      .where(and(eq(crmCadenceEnrollments.tenantId, user.tenantId), eq(crmCadenceEnrollments.leadId, leadId)))
      .orderBy(desc(crmCadenceEnrollments.enrolledAt));
    return c.json({ items });
  } catch (e) {
    console.error("[crm/cadences] înscrierile nu s-au putut citi:", e instanceof Error ? e.message : e);
    return c.json({ items: [], schemaLag: true });
  }
});

crmCadencesRoutes.post(
  "/enroll",
  editLeads,
  zValidator("json", z.object({ leadId: z.string().uuid(), cadenceId: z.string().uuid() })),
  async (c) => {
    const user = c.get("user");
    const { leadId, cadenceId } = c.req.valid("json");
    // Deja în cadența asta, activ → 409 cu înscrierea existentă, nu una nouă. Nu 200 cu cea
    // veche: fișa adaugă răspunsul în listă, deci ar arăta aceeași înscriere de două ori.
    const active = await findActiveEnrollment(user.tenantId, leadId, cadenceId);
    if (active) return c.json({ error: "already_enrolled", enrollment: active }, 409);
    const row = await enrollLeadInCadence(user.tenantId, leadId, cadenceId);
    // Lead sau cadență din alt workspace → 404, nu 403.
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row, 201);
  }
);

crmCadencesRoutes.post("/enrollments/:id/cancel", editLeads, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [row] = await db
    .update(crmCadenceEnrollments)
    .set({ status: "cancelled", nextFireAt: null, updatedAt: new Date() })
    .where(and(eq(crmCadenceEnrollments.id, id), eq(crmCadenceEnrollments.tenantId, user.tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

/** Butonul „rulează acum": aprinde pașii scadenți DOAR ai workspace-ului curent. */
crmCadencesRoutes.post("/run", manageCadences, async (c) => {
  const user = c.get("user");
  const result = await processDueEnrollments(new Date(), user.tenantId);
  return c.json({ ok: true, ...result });
});

// ─── Cadențe ──────────────────────────────────────────────────────────────────

crmCadencesRoutes.get("/", async (c) => {
  const user = c.get("user");
  try {
    const items = await db
      .select()
      .from(crmCadences)
      .where(eq(crmCadences.tenantId, user.tenantId))
      .orderBy(asc(crmCadences.createdAt));
    return c.json({ items });
  } catch (e) {
    console.error("[crm/cadences] listare eșuată:", e instanceof Error ? e.message : e);
    return c.json({ items: [], schemaLag: true });
  }
});

crmCadencesRoutes.post("/", manageCadences, zValidator("json", createCadenceSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const values: NewCrmCadence = { tenantId: user.tenantId, name: body.name };
  if (body.triggerStage !== undefined) values.triggerStage = body.triggerStage;
  if (body.enabled !== undefined) values.enabled = body.enabled;
  if (body.steps !== undefined) values.steps = body.steps;

  const [row] = await db.insert(crmCadences).values(values).returning();

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "cadence.created",
    target: "crm_cadence",
    targetId: row.id,
    after: { name: row.name, steps: row.steps?.length ?? 0 },
  });

  return c.json(row, 201);
});

crmCadencesRoutes.patch("/:id", manageCadences, zValidator("json", updateCadenceSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const updates: Partial<NewCrmCadence> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.triggerStage !== undefined) updates.triggerStage = body.triggerStage;
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.steps !== undefined) updates.steps = body.steps;

  const [row] = await db
    .update(crmCadences)
    .set(updates)
    .where(and(eq(crmCadences.id, id), eq(crmCadences.tenantId, user.tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

crmCadencesRoutes.delete("/:id", manageCadences, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const [deleted] = await db
    .delete(crmCadences)
    .where(and(eq(crmCadences.id, id), eq(crmCadences.tenantId, user.tenantId)))
    .returning();
  if (!deleted) return c.json({ error: "not_found" }, 404);

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "cadence.deleted",
    target: "crm_cadence",
    targetId: id,
    before: { name: deleted.name },
  });

  return c.json({ ok: true });
});
