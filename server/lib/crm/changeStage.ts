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
import { assignLeadAutomatically } from "../../routes/crmAssignment";
import { ensureTenantPipeline } from "./pipelines";
import { ensureTenantStages } from "./stages";
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

/**
 * Pâlnia leadului: cea a lui (dacă e a tenantului) sau implicita — CU etapele ei semănate.
 *
 * De ce seamănă aici și nu doar la `GET /stages` / `GET /leads/pipeline`: într-un workspace nou
 * etapele implicite nu existau până nu deschidea cineva tabla. Primul lead (creat din formular,
 * din aplicație sau venit de pe site) purta `stage = "new"`, dar orice mutare răspundea
 * `unknown_stage`, fișa arăta etapa `null`, iar mutarea în masă sărea leadul. Orice cale care
 * validează o etapă trece prin funcția asta, deci semănatul pe loc închide gaura pentru toate.
 * `ensureTenantStages` e idempotentă (gardă de numărare) și nu aruncă.
 */
export async function resolveLeadPipeline(
  tenantId: string,
  pipelineId: string | null
): Promise<{ id: string; isDefault: boolean } | null> {
  let resolved: { id: string; isDefault: boolean } | null = null;
  if (pipelineId) {
    const [row] = await db
      .select({ id: crmPipelines.id, isDefault: crmPipelines.isDefault })
      .from(crmPipelines)
      .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.tenantId, tenantId)));
    resolved = row ?? null;
  } else {
    const def = await ensureTenantPipeline(tenantId);
    resolved = def ? { id: def.id, isDefault: def.isDefault } : null;
  }
  if (resolved) await ensureTenantStages(tenantId, resolved.id);
  return resolved;
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

  // `assignFn` e aceeași pe care o primește crearea leadului: fără ea, o automatizare „atribuie
  // după regulă" declanșată de o schimbare de etapă nu avea cu ce atribui și scria în jurnal
  // „atribuirea n-a putut fi făcută", deși regulile de repartizare existau.
  await runAutomations({
    tenantId,
    userId,
    lead: row,
    kind: "lead.stage_changed",
    toStage,
    assignFn: async (l) => (await assignLeadAutomatically(tenantId, l))?.userId ?? null,
  });

  // Cadențele cu etapă declanșatoare: intrarea în etapă înscrie leadul în secvența de urmărire.
  await enrollByStage(tenantId, leadId, toStage);

  // Stocul produsului: scade la prima intrare în „câștigat", se întoarce la ieșirea din el.
  const stock = await syncLeadStockForStage({ tenantId, userId, lead: row, fromStage, toStage });

  const [fresh] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
  return { lead: fresh ?? row, stock };
}
