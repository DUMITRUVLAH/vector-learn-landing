/**
 * CRM Faza 9 — reactivarea clienților pierduți.
 *
 * Portare din crm-vector (`src/lib/crm/reengagement.ts`). „Un client pierdut de N luni primește
 * automat o acțiune de reactivare" — task, înscriere într-o cadență, sau o etichetă.
 *
 * De ce NU e o automatizare obișnuită: motorul de automatizări are exact două declanșatoare,
 * `lead.created` și `lead.stage_changed`, amândouă legate de o schimbare care se întâmplă ACUM.
 * Reactivarea are nevoie de un declanșator PE TIMP („au trecut N luni de la pierdere"), care nu
 * există acolo.
 *
 * Deciziile sunt PURE (`lostStageKeys`, `deriveLostAt`, `dueForReengagement`) — testabile fără
 * bază de date. Doar aplicarea atinge datele.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import {
  crmReengagementRules,
  crmReengagementRuns,
  type CrmReengagementRule,
} from "../../db/schema/crmCadences";
import { crmPipelineStages } from "../../db/schema/crmPipelineStages";
import { crmLeadTasks } from "../../db/schema/crmTasks";
import { leadInteractions, leadTags, leads } from "../../db/schema/leads";
import { enrollLeadInCadence } from "./cadences";

// ─── Logică pură ──────────────────────────────────────────────────────────────

/** Cheile etapelor „pierdut" — derivate din flag, NICIODATĂ hardcodate („lost", „closed_lost"). */
export function lostStageKeys(stages: readonly { key: string; isLost: boolean }[]): Set<string> {
  return new Set(stages.filter((s) => s.isLost).map((s) => s.key));
}

export interface StageChangeEvent {
  /** Cheia etapei ÎN CARE a intrat leadul la acea tranziție. */
  to: string;
  occurredAt: Date;
}

/**
 * Când a intrat leadul ULTIMA OARĂ într-o etapă pierdută, derivat din cronologie — NU din
 * `updated_at`, pe care orice editare ulterioară l-ar muta și ar strica pragul de timp.
 *
 * `null` când leadul nu mai e acum într-o etapă pierdută (a fost redeschis între timp, deci nu
 * mai trebuie trezit) sau când nu există nicio tranziție înregistrată — mai bine nimic decât o
 * dată ghicită.
 */
export function deriveLostAt(
  currentStage: string,
  stageChanges: readonly StageChangeEvent[],
  lostKeys: ReadonlySet<string>
): Date | null {
  if (!lostKeys.has(currentStage)) return null;
  const lostTransitions = stageChanges
    .filter((sc) => lostKeys.has(sc.to))
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  return lostTransitions[0]?.occurredAt ?? null;
}

export interface ReengagementLeadInput {
  id: string;
  stage: string;
  lostReason: string | null;
  /** `null` = nu e (sau nu mai e) pierdut → niciodată eligibil. */
  lostAt: Date | null;
}

export interface DueReengagement {
  rule: CrmReengagementRule;
  lead: ReengagementLeadInput;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Ce perechi (regulă, lead) trebuie trezite ACUM. La exact N luni e scadent; cu o zi mai devreme
 * nu e; un lead deja rulat pentru regula asta nu mai iese niciodată; un lead revenit la viață
 * (`lostAt === null`) nu iese niciodată.
 */
export function dueForReengagement(
  leadRows: readonly ReengagementLeadInput[],
  rules: readonly CrmReengagementRule[],
  runs: readonly { ruleId: string; leadId: string }[],
  now: Date = new Date()
): DueReengagement[] {
  const alreadyRan = new Set(runs.map((r) => `${r.ruleId}:${r.leadId}`));
  const out: DueReengagement[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const lead of leadRows) {
      if (lead.lostAt === null) continue;
      if (alreadyRan.has(`${rule.id}:${lead.id}`)) continue;
      const stageKeys = rule.stageKeys ?? [];
      if (stageKeys.length > 0 && !stageKeys.includes(lead.stage)) continue;
      const lostReasons = rule.lostReasons ?? [];
      if (lostReasons.length > 0 && !(lead.lostReason && lostReasons.includes(lead.lostReason))) continue;

      if (addMonths(lead.lostAt, rule.afterMonths).getTime() <= now.getTime()) {
        out.push({ rule, lead });
      }
    }
  }
  return out;
}

// ─── Strat de date ────────────────────────────────────────────────────────────

/** Leadurile aflate ACUM într-o etapă pierdută, cu `lostAt` derivat din cronologie. */
export async function listLostLeads(tenantId: string): Promise<ReengagementLeadInput[]> {
  const stages = await db
    .select({ key: crmPipelineStages.key, isLost: crmPipelineStages.isLost })
    .from(crmPipelineStages)
    .where(eq(crmPipelineStages.tenantId, tenantId));
  const lostKeys = lostStageKeys(stages);
  if (lostKeys.size === 0) return [];

  const leadRows = await db
    .select({ id: leads.id, stage: leads.stage, lostReason: leads.lostReason })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), inArray(leads.stage, [...lostKeys])));
  if (leadRows.length === 0) return [];

  const changes = await db
    .select({
      leadId: leadInteractions.leadId,
      occurredAt: leadInteractions.occurredAt,
      metadata: leadInteractions.metadata,
    })
    .from(leadInteractions)
    .where(
      and(
        eq(leadInteractions.tenantId, tenantId),
        eq(leadInteractions.type, "stage_change"),
        inArray(
          leadInteractions.leadId,
          leadRows.map((l) => l.id)
        )
      )
    );

  const byLead: Record<string, StageChangeEvent[]> = {};
  for (const row of changes) {
    const to = (row.metadata as { to?: string } | null)?.to;
    if (!to) continue;
    (byLead[row.leadId] ??= []).push({ to, occurredAt: row.occurredAt });
  }

  return leadRows.map((l) => ({
    id: l.id,
    stage: l.stage,
    lostReason: l.lostReason,
    lostAt: deriveLostAt(l.stage, byLead[l.id] ?? [], lostKeys),
  }));
}

/** Ce s-ar întâmpla dacă am rula acum — fără niciun efect. Asta vede omul înainte să apese. */
export async function previewDueReengagements(tenantId: string, now: Date = new Date()): Promise<DueReengagement[]> {
  const [rules, lostLeads] = await Promise.all([
    db
      .select()
      .from(crmReengagementRules)
      .where(eq(crmReengagementRules.tenantId, tenantId))
      .orderBy(asc(crmReengagementRules.orderIndex)),
    listLostLeads(tenantId),
  ]);
  if (rules.length === 0 || lostLeads.length === 0) return [];

  const runs = await db
    .select({ ruleId: crmReengagementRuns.ruleId, leadId: crmReengagementRuns.leadId })
    .from(crmReengagementRuns)
    .where(eq(crmReengagementRuns.tenantId, tenantId));

  return dueForReengagement(lostLeads, rules, runs, now);
}

/**
 * Aplică o pereche (regulă, lead).
 *
 * Rândul din `crm_reengagement_runs` se scrie INDIFERENT de rezultat: unicitatea (regulă, lead)
 * e garanția că regula asta nu mai trezește niciodată leadul ăsta a doua oară — chiar dacă
 * acțiunea a eșuat. Altfel, la fiecare rulare a cronului, un client deja pierdut ar primi din nou
 * același task.
 */
async function applyOne(tenantId: string, due: DueReengagement): Promise<"ok" | "failed"> {
  let result: "ok" | "failed" = "ok";
  try {
    const rule = due.rule;
    if (rule.action === "create_task") {
      await db.insert(crmLeadTasks).values({
        tenantId,
        leadId: due.lead.id,
        title: rule.taskTitle?.trim() || "Reactivare client pierdut",
        dueAt: new Date(),
        status: "open",
      });
    } else if (rule.action === "enroll_cadence") {
      if (!rule.cadenceId) throw new Error("regula enroll_cadence nu are o cadență setată");
      const enrolled = await enrollLeadInCadence(tenantId, due.lead.id, rule.cadenceId);
      if (!enrolled) throw new Error("cadența nu mai există");
    } else if (rule.action === "add_tag") {
      const tag = rule.taskTitle?.trim() || "Reactivare";
      // Eticheta poate exista deja pe lead — nu e o eroare, e chiar starea dorită. Verificarea e
      // în cod, nu pe un `ON CONFLICT`: indexul (lead_id, tag) din migrarea 0007 NU e unic, deci
      // baza n-ar absorbi coliziunea și leadul ar rămâne cu aceeași etichetă de două ori.
      const [existingTag] = await db
        .select({ id: leadTags.id })
        .from(leadTags)
        .where(and(eq(leadTags.tenantId, tenantId), eq(leadTags.leadId, due.lead.id), eq(leadTags.tag, tag)));
      if (!existingTag) {
        await db.insert(leadTags).values({ tenantId, leadId: due.lead.id, tag });
      }
    }

    await db.insert(leadInteractions).values({
      tenantId,
      leadId: due.lead.id,
      type: "system",
      direction: "internal",
      body: `Reactivare aplicată: „${rule.name}” (${rule.action})`,
      metadata: { reengagementRuleId: rule.id },
    });
  } catch (e) {
    console.error("[crm/reengagement] acțiunea a eșuat:", e instanceof Error ? e.message : e);
    result = "failed";
  }

  await db
    .insert(crmReengagementRuns)
    .values({ tenantId, ruleId: due.rule.id, leadId: due.lead.id, result })
    // Coliziunea pe (regulă, lead) înseamnă că altcineva a apucat deja — exact ce vrem.
    .onConflictDoNothing();

  return result;
}

export interface RunReengagementResult {
  due: number;
  applied: number;
  failed: number;
}

/** Rulează efectiv tot ce e scadent pentru un workspace. */
export async function runReengagement(tenantId: string, now: Date = new Date()): Promise<RunReengagementResult> {
  const due = await previewDueReengagements(tenantId, now);
  let applied = 0;
  let failed = 0;
  for (const d of due) {
    const result = await applyOne(tenantId, d);
    if (result === "ok") applied++;
    else failed++;
  }
  return { due: due.length, applied, failed };
}
