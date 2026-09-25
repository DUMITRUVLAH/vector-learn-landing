/**
 * Schimbarea de etapă a unui lead — O SINGURĂ implementare, folosită de tablă și de acte.
 *
 * Extrasă din `PATCH /api/crm/leads/:id/stage` (CRM-D05) ca actele să poată muta leadul (ofertă
 * trimisă → etapa de ofertă, contract semnat → câștigat) exact cum îl mută omul: cu rândul din
 * istoric, jurnalul, automatizările, cadențele și stocul. O a doua implementare ar fi uitat unul
 * dintre ele, iar rapoartele (care numără DIN rândurile `stage_change`) ar fi mințit.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { leads, leadInteractions, type NewLead, type NewLeadInteraction } from "../../db/schema/leads";
import { crmPipelineStages } from "../../db/schema/crmPipelineStages";
import { crmPipelines } from "../../db/schema/crmPipelines";
import { runAutomations } from "../../routes/crmAutomations";
import { ensureTenantPipeline } from "./pipelines";
import { enrollByStage } from "./cadences";
import { syncLeadStockForStage } from "./productStock";
import { logCrmAudit } from "./audit";

export interface PipelineStageRow {
  id: string;
  key: string;
  label: string;
  isLost: boolean;
  isWon: boolean;
  orderIndex: number;
}

/** Pâlnia leadului: cea a lui (dacă e a tenantului) sau implicita. */
export async function resolveLeadPipeline(
  tenantId: string,
  pipelineId: string | null
): Promise<{ id: string; isDefault: boolean } | null> {
  if (pipelineId) {
    const [row] = await db
      .select({ id: crmPipelines.id, isDefault: crmPipelines.isDefault })
      .from(crmPipelines)
      .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.tenantId, tenantId)));
    return row ?? null;
  }
  const def = await ensureTenantPipeline(tenantId);
  return def ? { id: def.id, isDefault: def.isDefault } : null;
}

/** Etapele unei pâlnii, în ordine. Pentru `null` (degradat) — etapele fără pâlnie ale tenantului. */
export async function stagesOfPipeline(tenantId: string, pipelineId: string | null): Promise<PipelineStageRow[]> {
  return db
    .select({
      id: crmPipelineStages.id,
      key: crmPipelineStages.key,
      label: crmPipelineStages.label,
      isLost: crmPipelineStages.isLost,
      isWon: crmPipelineStages.isWon,
      orderIndex: crmPipelineStages.orderIndex,
    })
    .from(crmPipelineStages)
    .where(
      pipelineId
        ? and(eq(crmPipelineStages.tenantId, tenantId), eq(crmPipelineStages.pipelineId, pipelineId))
        : and(eq(crmPipelineStages.tenantId, tenantId), isNull(crmPipelineStages.pipelineId))
    )
    .orderBy(asc(crmPipelineStages.orderIndex));
}

/**
 * Aplică o schimbare de etapă DEJA validată (etapa există în pâlnia leadului; motivul de pierdere
 * e dat când trebuie). Scrie istoricul, jurnalul, rulează automatizările, cadențele și stocul.
 */
export async function applyLeadStageChange(opts: {
  tenantId: string;
  userId: string;
  leadId: string;
  fromStage: string;
  toStage: string;
  isLost: boolean;
  lostReason?: string | null;
  /** De unde vine mutarea, când nu e un om pe tablă (ex. „contractul CTR-2026-0001 a fost semnat"). */
  cause?: string | null;
}) {
  const { tenantId, userId, leadId, fromStage, toStage, isLost, lostReason = null, cause = null } = opts;

  const updates: Partial<NewLead> = { stage: toStage, updatedAt: new Date() };
  if (isLost) updates.lostReason = lostReason ?? null;

  const [row] = await db
    .update(leads)
    .set(updates)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)))
    .returning();

  // Orice schimbare de etapă lasă o urmă în istoric — fără asta, nimeni nu poate reconstitui
  // parcursul unui lead prin pipeline (cine l-a mutat, când, de ce a fost pierdut).
  const interaction: NewLeadInteraction = {
    tenantId,
    leadId,
    type: "stage_change",
    direction: "internal",
    body: cause ? `${fromStage} → ${toStage} · ${cause}` : `${fromStage} → ${toStage}`,
    metadata: { from: fromStage, to: toStage, lostReason: lostReason ?? null, ...(cause ? { cause } : {}) },
    userId,
  };
  await db.insert(leadInteractions).values(interaction);

  await logCrmAudit({
    tenantId,
    actorId: userId,
    action: "lead.stage_changed",
    target: "crm_lead",
    targetId: leadId,
    before: { stage: fromStage },
    after: { stage: toStage, lostReason: lostReason ?? null, ...(cause ? { cause } : {}) },
  });

  await runAutomations({ tenantId, userId, lead: row, kind: "lead.stage_changed", toStage });

  // Cadențele cu etapă declanșatoare: intrarea în etapă înscrie leadul în secvența de urmărire.
  await enrollByStage(tenantId, leadId, toStage);

  // Stocul produsului: scade la prima intrare în „câștigat", se întoarce la ieșirea din el.
  const stock = await syncLeadStockForStage({ tenantId, userId, lead: row, fromStage, toStage });

  const [fresh] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
  return { lead: fresh ?? row, stock };
}
