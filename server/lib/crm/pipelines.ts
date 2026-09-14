/**
 * CRM — garanția că orice workspace are o pâlnie implicită, iar etapele și leadurile lui
 * aparțin uneia.
 *
 * Model: `server/lib/crm/stages.ts` (`ensureTenantStages`) — gardă de numărare, idempotent,
 * best-effort. Aceeași regulă: un GET nu are voie să dea 500 fiindcă seed-ul n-a mers.
 *
 * Adopția rândurilor vechi se face AICI, nu doar în migrare: prod-ul nu aplică fiabil migrările
 * (vezi `server/db/sync-schema.ts`), deci un workspace poate ajunge cu `crm_pipelines` creată de
 * heal, dar cu etapele încă fără `pipeline_id`. Prima citire le adoptă în pâlnia implicită.
 */
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { crmPipelines, type CrmPipeline } from "../../db/schema/crmPipelines";
import { crmPipelineStages } from "../../db/schema/crmPipelineStages";
import { leads } from "../../db/schema/leads";

/** Numele pâlniei pe care o primește un workspace fără nicio pâlnie. */
export const DEFAULT_PIPELINE_NAME = "Vânzări";

/**
 * Întoarce pâlnia implicită a tenantului, creând-o dacă lipsește și adoptând în ea etapele
 * rămase fără pâlnie. `null` doar în cazul degradat (tabela lipsește cu totul) — apelanții
 * trebuie să răspundă atunci cu o listă goală, nu cu 500.
 */
export async function ensureTenantPipeline(tenantId: string): Promise<CrmPipeline | null> {
  try {
    const existing = await db
      .select()
      .from(crmPipelines)
      .where(eq(crmPipelines.tenantId, tenantId))
      .orderBy(asc(crmPipelines.orderIndex), asc(crmPipelines.createdAt));

    let def = existing.find((p) => p.isDefault) ?? existing[0] ?? null;

    if (!def) {
      const [created] = await db
        .insert(crmPipelines)
        .values({ tenantId, name: DEFAULT_PIPELINE_NAME, orderIndex: 0, isDefault: true })
        .returning();
      def = created ?? null;
    } else if (!def.isDefault) {
      // Tenant cu pâlnii, dar niciuna marcată implicită (ex. implicita ștearsă direct în bază):
      // prima devine implicita, ca leadurile fără pâlnie să aibă unde ateriza.
      const [fixed] = await db
        .update(crmPipelines)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(and(eq(crmPipelines.id, def.id), eq(crmPipelines.tenantId, tenantId)))
        .returning();
      def = fixed ?? def;
    }

    if (def) await adoptOrphanStages(tenantId, def.id);
    return def;
  } catch (e) {
    console.error(
      "[crm/pipelines] ensureTenantPipeline eșec pentru tenant",
      tenantId,
      ":",
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

/** Etapele rămase fără pâlnie (dinainte de migrarea 0166) intră în pâlnia implicită. */
async function adoptOrphanStages(tenantId: string, pipelineId: string): Promise<void> {
  await db
    .update(crmPipelineStages)
    .set({ pipelineId })
    .where(and(eq(crmPipelineStages.tenantId, tenantId), isNull(crmPipelineStages.pipelineId)));
}

/**
 * Pâlnia efectivă a unui lead: `pipeline_id`, sau implicita când e null. Pură — testabilă fără
 * bază de date, exact ca `resolveLeadPipelineId` din CRM-ul de referință.
 */
export function resolveLeadPipelineId(
  lead: { pipelineId?: string | null },
  pipelines: readonly CrmPipeline[]
): string | null {
  if (lead.pipelineId && pipelines.some((p) => p.id === lead.pipelineId)) return lead.pipelineId;
  return pipelines.find((p) => p.isDefault)?.id ?? pipelines[0]?.id ?? null;
}

/** Următorul `orderIndex` liber din pâlniile tenantului. */
export async function nextPipelineOrderIndex(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${crmPipelines.orderIndex}), -1)::int` })
    .from(crmPipelines)
    .where(eq(crmPipelines.tenantId, tenantId));
  return (row?.maxOrder ?? -1) + 1;
}

/**
 * Condiția „leadurile din pâlnia asta", cu regula NULL = implicita.
 *
 * Pentru pâlnia implicită întoarce `pipeline_id = <id> OR pipeline_id IS NULL`, ca leadurile
 * dinainte de migrare să rămână vizibile fără să fie rescrise. Pentru orice altă pâlnie,
 * potrivire exactă.
 */
export function leadsInPipeline(pipelineId: string, isDefaultPipeline: boolean) {
  return isDefaultPipeline
    ? or(eq(leads.pipelineId, pipelineId), isNull(leads.pipelineId))
    : eq(leads.pipelineId, pipelineId);
}
