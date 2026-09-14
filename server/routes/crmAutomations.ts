/**
 * CRM — automatizări: reguli care mișcă singure lead-urile.
 *
 * Decizia (ce regulă pornește, ce condiții trec) e pură, în
 * `server/lib/crm/automations.ts`. Aici sunt efectele și tenantul.
 *
 * Trei lucruri pe care le-am ținut cu dinții la portare, fiindcă fiecare dintre
 * ele e o pățanie reală a unui CRM cu automatizări:
 *
 * 1. O automatizare care pică NU strică acțiunea omului. Dacă regula „atribuie
 *    automat" crapă, lead-ul rămâne salvat și neatribuit — nu dispare cu tot cu
 *    formularul completat. De-aici `runAutomations` nu aruncă niciodată în sus.
 * 2. Lanțul de reguli e plafonat. `move_stage` redeclanșează automatizările de
 *    „stage_changed"; două reguli care mută A→B și B→A sunt scrise de oameni
 *    cumsecade, în două zile diferite, și ar rula până cade cererea.
 * 3. Fiecare rulare lasă urmă. „De ce s-a mutat singur lead-ul meu" e prima
 *    întrebare după pornirea automatizărilor, iar fără jurnal nu are răspuns.
 *
 * Montat la /api/crm/automations.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions, leadTags } from "../db/schema/leads";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { crmLeadTasks } from "../db/schema/crmTasks";
import { crmAutomations, crmAutomationRuns } from "../db/schema/crmAutomations";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import {
  planRuns,
  triggerMatches,
  conditionsPass,
  validateAutomation,
  MAX_AUTOMATION_DEPTH,
  type AutomationAction,
  type AutomationLike,
  type TriggerKind,
} from "../lib/crm/automations";

export const crmAutomationsRoutes = new Hono<{ Variables: AuthVariables }>();
crmAutomationsRoutes.use("/*", requireAuth);
// O regulă de automatizare mișcă singură leadurile altora: se citește de oricine, se schimbă de
// cine administrează.
crmAutomationsRoutes.post("/*", requireCrmPermission("automations.manage"));
crmAutomationsRoutes.patch("/*", requireCrmPermission("automations.manage"));
crmAutomationsRoutes.delete("/*", requireCrmPermission("automations.manage"));

const conditionSchema = z.object({
  field: z.string().min(1).max(60),
  op: z.enum(["eq", "neq", "contains", "gte", "lte", "exists", "not_exists"]),
  value: z.union([z.string(), z.number()]).optional(),
});

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_task"), title: z.string().min(1).max(300), dueInDays: z.number().int().min(0).max(365).optional() }),
  z.object({ type: z.literal("move_stage"), stageKey: z.string().min(1).max(64) }),
  z.object({ type: z.literal("add_tag"), tag: z.string().min(1).max(60) }),
  z.object({ type: z.literal("add_note"), body: z.string().min(1).max(2000) }),
  z.object({
    type: z.literal("assign"),
    userId: z.string().uuid().nullish(),
    strategy: z.enum(["round_robin", "capacity", "weighted", "territory"]).nullish(),
  }),
]);

const automationSchema = z.object({
  name: z.string().min(1, "Regula are nevoie de un nume").max(200),
  enabled: z.boolean().default(true),
  trigger: z.object({
    kind: z.enum(["lead.created", "lead.stage_changed"]),
    toStage: z.string().max(64).nullish(),
  }),
  conditions: z.array(conditionSchema).default([]),
  actions: z.array(actionSchema).min(1, "Regula nu face nimic — adaugă cel puțin o acțiune"),
});

function isMissingSchemaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /relation .* does not exist|column .* does not exist|undefined_table|undefined_column/i.test(msg);
}

/** Forma pe care o văd condițiile: câmpurile lead-ului, plate. */
function leadAsRecord(lead: typeof leads.$inferSelect): Record<string, unknown> {
  return lead as unknown as Record<string, unknown>;
}

// ─── Executorul ──────────────────────────────────────────────────────────────

export interface AutomationOutcome {
  automationId: string;
  automationName: string;
  matched: boolean;
  applied: { action: string; detail?: string }[];
  error?: string;
}

/**
 * Rulează automatizările pentru un eveniment și scrie jurnalul.
 *
 * NU ARUNCĂ NICIODATĂ. Chemată din crearea leadului și din mutarea de etapă:
 * dacă ar arunca, o regulă greșită ar face imposibilă salvarea unui lead — omul
 * ar avea formularul completat și un mesaj de eroare fără legătură cu ce a făcut.
 *
 * `assignFn` e injectată de apelant ca să nu legăm automatizările de modulul de
 * distribuire la nivel de import: dacă distribuirea nu e disponibilă, acțiunea
 * de atribuire se notează ca nereușită, restul regulii merge mai departe.
 */
export async function runAutomations(opts: {
  tenantId: string;
  userId: string | null;
  lead: typeof leads.$inferSelect;
  kind: TriggerKind;
  toStage?: string;
  depth?: number;
  assignFn?: (lead: typeof leads.$inferSelect, strategy: string) => Promise<string | null>;
}): Promise<AutomationOutcome[]> {
  const depth = opts.depth ?? 0;
  const outcomes: AutomationOutcome[] = [];

  try {
    const rows = await db
      .select()
      .from(crmAutomations)
      .where(eq(crmAutomations.tenantId, opts.tenantId))
      .orderBy(asc(crmAutomations.orderIndex));

    const candidates = (rows as unknown as AutomationLike[])
      .filter((a) => a.enabled)
      .filter((a) => triggerMatches(a, opts.kind, opts.toStage));
    if (candidates.length === 0) return [];

    /**
     * Lead-ul se actualizează pe măsură ce acțiunile îl schimbă, iar condițiile
     * fiecărei reguli se evaluează pe starea CURENTĂ, nu pe o fotografie de la
     * început.
     *
     * Am descoperit inconsistența dintr-un test: acțiunile cascadau deja (un
     * `move_stage` redeclanșează regulile de etapă), dar condițiile se uitau la
     * starea inițială. Consecința era o regulă „dacă etapa e Nou" care se aplica
     * unui lead pe care regula dinaintea ei tocmai îl mutase în „Contactat" —
     * adică se declanșa pe o stare care nu mai există. Pentru omul care scrie
     * reguli, o listă se citește de sus în jos, cu efect imediat.
     */
    let current = opts.lead;

    for (const auto of candidates) {
      const matched = conditionsPass(leadAsRecord(current), auto.conditions);
      const outcome: AutomationOutcome = {
        automationId: auto.id,
        automationName: auto.name,
        matched,
        applied: [],
      };

      try {
        for (const action of matched ? auto.actions : []) {
          const result = await applyAction({
            tenantId: opts.tenantId,
            userId: opts.userId,
            lead: current,
            action,
            depth,
            assignFn: opts.assignFn,
          });
          if (result.lead) current = result.lead;
          outcome.applied.push({ action: action.type, detail: result.detail });
        }
      } catch (err) {
        // O regulă picată nu le oprește pe celelalte și, mai ales, nu strică
        // acțiunea omului. Se notează în jurnal și se merge mai departe.
        outcome.error = err instanceof Error ? err.message : String(err);
        console.error("[crm-automations] regula a picat:", auto.name, err);
      }

      outcomes.push(outcome);

      if (matched || outcome.error) {
        await db
          .insert(crmAutomationRuns)
          .values({
            tenantId: opts.tenantId,
            automationId: auto.id,
            automationName: auto.name,
            leadId: current.id,
            triggerKind: opts.kind,
            actions: outcome.applied,
            status: outcome.error ? "error" : "ok",
            error: outcome.error ?? null,
          })
          .catch((err: unknown) => {
            // Jurnalul e important, dar nu mai important decât lead-ul.
            console.error("[crm-automations] jurnalul nu s-a putut scrie:", err);
          });
      }
    }
  } catch (err) {
    if (!isMissingSchemaError(err)) {
      console.error("[crm-automations] rulare eșuată:", err);
    }
    // Schema încă nesincronizată pe acest workspace → pur și simplu nu există
    // automatizări. Nu e o eroare pe care s-o vadă omul care salvează un lead.
  }

  return outcomes;
}

async function applyAction(ctx: {
  tenantId: string;
  userId: string | null;
  lead: typeof leads.$inferSelect;
  action: AutomationAction;
  depth: number;
  assignFn?: (lead: typeof leads.$inferSelect, strategy: string) => Promise<string | null>;
}): Promise<{ lead?: typeof leads.$inferSelect; detail?: string }> {
  const { tenantId, userId, lead, action } = ctx;

  switch (action.type) {
    case "create_task": {
      const dueAt = action.dueInDays != null ? new Date(Date.now() + action.dueInDays * 86_400_000) : null;
      await db.insert(crmLeadTasks).values({
        tenantId,
        leadId: lead.id,
        title: action.title,
        dueAt,
        assignedTo: lead.assignedTo ?? null,
      });
      return { detail: action.title };
    }

    case "add_tag": {
      // Eticheta pusă de două reguli nu trebuie să apară de două ori: indexul
      // de unicitate e un index simplu, nu o constrângere, deci verificăm noi.
      const existing = await db
        .select({ id: leadTags.id })
        .from(leadTags)
        .where(and(eq(leadTags.tenantId, tenantId), eq(leadTags.leadId, lead.id), eq(leadTags.tag, action.tag)));
      if (existing.length === 0) {
        await db.insert(leadTags).values({ tenantId, leadId: lead.id, tag: action.tag });
      }
      return { detail: action.tag };
    }

    case "add_note": {
      await db.insert(leadInteractions).values({
        tenantId,
        leadId: lead.id,
        type: "note",
        direction: "internal",
        body: action.body,
        metadata: { automation: true },
        userId,
      });
      return { detail: action.body.slice(0, 80) };
    }

    case "move_stage": {
      if (lead.stage === action.stageKey) return { detail: "deja în etapă" };
      if (ctx.depth >= MAX_AUTOMATION_DEPTH) return { detail: "oprit: lanț prea lung" };

      // Etapa țintă trebuie să existe în pâlnia ACESTUI workspace. O cheie
      // necunoscută ar face lead-ul invizibil: există în bază, în nicio coloană.
      const [target] = await db
        .select({ key: crmPipelineStages.key, isLost: crmPipelineStages.isLost })
        .from(crmPipelineStages)
        .where(and(eq(crmPipelineStages.tenantId, tenantId), eq(crmPipelineStages.key, action.stageKey)));
      if (!target) return { detail: `etapa „${action.stageKey}" nu există` };

      const from = lead.stage;
      const [moved] = await db
        .update(leads)
        .set({ stage: action.stageKey, updatedAt: new Date() })
        .where(and(eq(leads.id, lead.id), eq(leads.tenantId, tenantId)))
        .returning();

      await db.insert(leadInteractions).values({
        tenantId,
        leadId: lead.id,
        type: "stage_change",
        direction: "internal",
        body: `${from} → ${action.stageKey}`,
        metadata: { from, to: action.stageKey, automation: true },
        userId,
      });

      // Mutarea redeclanșează automatizările de etapă — cu adâncimea crescută.
      await runAutomations({
        tenantId,
        userId,
        lead: moved,
        kind: "lead.stage_changed",
        toStage: action.stageKey,
        depth: ctx.depth + 1,
        assignFn: ctx.assignFn,
      });

      return { lead: moved, detail: `${from} → ${action.stageKey}` };
    }

    case "assign": {
      if (action.userId) {
        // Verificăm că omul e chiar din workspace-ul ăsta. Un id rămas într-o
        // regulă după ce omul a plecat din firmă nu are voie să scrie.
        const { users } = await import("../db/schema/users");
        const [member] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.id, action.userId), eq(users.tenantId, tenantId)));
        if (!member) return { detail: "omul din regulă nu mai e în echipă" };

        const [updated] = await db
          .update(leads)
          .set({ assignedTo: action.userId, updatedAt: new Date() })
          .where(and(eq(leads.id, lead.id), eq(leads.tenantId, tenantId)))
          .returning();
        return { lead: updated, detail: "atribuit direct" };
      }

      if (action.strategy && ctx.assignFn) {
        const assigned = await ctx.assignFn(lead, action.strategy);
        if (!assigned) return { detail: "niciun agent eligibil" };
        const [updated] = await db
          .select()
          .from(leads)
          .where(and(eq(leads.id, lead.id), eq(leads.tenantId, tenantId)));
        return { lead: updated, detail: `atribuit prin ${action.strategy}` };
      }

      return { detail: "atribuirea n-a putut fi făcută" };
    }

    default:
      return {};
  }
}

// ─── Rutele ──────────────────────────────────────────────────────────────────

crmAutomationsRoutes.get("/", async (c) => {
  const user = c.get("user");
  try {
    const items = await db
      .select()
      .from(crmAutomations)
      .where(eq(crmAutomations.tenantId, user.tenantId))
      .orderBy(asc(crmAutomations.orderIndex));
    return c.json({ items });
  } catch (err) {
    if (isMissingSchemaError(err)) return c.json({ items: [] });
    throw err;
  }
});

crmAutomationsRoutes.post("/", zValidator("json", automationSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const problems = validateAutomation({
    trigger: { kind: body.trigger.kind, toStage: body.trigger.toStage ?? undefined },
    actions: body.actions as AutomationAction[],
  });
  if (problems.length > 0) return c.json({ error: "invalid_automation", problems }, 400);

  const [maxRow] = await db
    .select({ max: crmAutomations.orderIndex })
    .from(crmAutomations)
    .where(eq(crmAutomations.tenantId, user.tenantId))
    .orderBy(desc(crmAutomations.orderIndex))
    .limit(1);

  const [row] = await db
    .insert(crmAutomations)
    .values({
      tenantId: user.tenantId,
      name: body.name,
      enabled: body.enabled,
      trigger: { kind: body.trigger.kind, toStage: body.trigger.toStage ?? undefined },
      conditions: body.conditions,
      actions: body.actions as AutomationAction[],
      orderIndex: (maxRow?.max ?? -1) + 1,
    })
    .returning();

  return c.json(row, 201);
});

crmAutomationsRoutes.patch("/:id", zValidator("json", automationSchema.partial()), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(crmAutomations)
    .where(and(eq(crmAutomations.id, id), eq(crmAutomations.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const nextTrigger = body.trigger
    ? { kind: body.trigger.kind, toStage: body.trigger.toStage ?? undefined }
    : existing.trigger;
  const nextActions = (body.actions as AutomationAction[] | undefined) ?? existing.actions;

  const problems = validateAutomation({ trigger: nextTrigger, actions: nextActions });
  if (problems.length > 0) return c.json({ error: "invalid_automation", problems }, 400);

  const [row] = await db
    .update(crmAutomations)
    .set({
      name: body.name ?? existing.name,
      enabled: body.enabled ?? existing.enabled,
      trigger: nextTrigger,
      conditions: body.conditions ?? existing.conditions,
      actions: nextActions,
      updatedAt: new Date(),
    })
    .where(and(eq(crmAutomations.id, id), eq(crmAutomations.tenantId, user.tenantId)))
    .returning();

  return c.json(row);
});

crmAutomationsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const [deleted] = await db
    .delete(crmAutomations)
    .where(and(eq(crmAutomations.id, c.req.param("id")), eq(crmAutomations.tenantId, user.tenantId)))
    .returning({ id: crmAutomations.id });
  if (!deleted) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

/**
 * Ce s-ar întâmpla cu un lead anume, fără să se întâmple.
 *
 * Fără asta, singura cale de a verifica o regulă e s-o pornești peste baza
 * reală și să vezi ce s-a stricat.
 */
crmAutomationsRoutes.post(
  "/preview",
  zValidator("json", z.object({ leadId: z.string().uuid(), kind: z.enum(["lead.created", "lead.stage_changed"]).default("lead.created"), toStage: z.string().max(64).nullish() })),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const [lead] = await db
      .select()
      .from(leads)
      .where(and(eq(leads.id, body.leadId), eq(leads.tenantId, user.tenantId)));
    if (!lead) return c.json({ error: "not_found" }, 404);

    const rows = await db
      .select()
      .from(crmAutomations)
      .where(eq(crmAutomations.tenantId, user.tenantId))
      .orderBy(asc(crmAutomations.orderIndex));

    const plan = planRuns(rows as unknown as AutomationLike[], leadAsRecord(lead), body.kind, body.toStage ?? undefined);
    return c.json({ plan });
  }
);

/** Jurnalul: ce a făcut fiecare regulă și pe ce lead. */
crmAutomationsRoutes.get("/runs", async (c) => {
  const user = c.get("user");
  const leadId = c.req.query("leadId");

  const filters = [eq(crmAutomationRuns.tenantId, user.tenantId)];
  if (leadId) filters.push(eq(crmAutomationRuns.leadId, leadId));

  try {
    const items = await db
      .select()
      .from(crmAutomationRuns)
      .where(and(...filters))
      .orderBy(desc(crmAutomationRuns.createdAt))
      .limit(100);
    return c.json({ items });
  } catch (err) {
    if (isMissingSchemaError(err)) return c.json({ items: [] });
    throw err;
  }
});
