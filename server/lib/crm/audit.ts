/**
 * CRM Faza 9 — jurnalul acțiunilor CRM.
 *
 * Portare din crm-vector (`src/lib/crm/audit.ts`), dar NU ca motor nou: acolo jurnalul era scris
 * de un trigger Postgres într-o tabelă proprie. FinFlow are deja `audit_log` + `writeAuditLog`
 * (server/lib/auditLogger.ts), folosite de HR și de restul modulelor. Un al doilea jurnal ar
 * însemna două răspunsuri la „cine a schimbat asta" — exact greșeala evitată la comunicare, unde
 * `lead_interactions` a fost refolosită în loc să apară un al doilea jurnal (PORT §3).
 *
 * Aici trăiesc doar convențiile CRM peste acel jurnal: prefixul acțiunilor și tipurile de țintă.
 */
import { writeAuditLog } from "../auditLogger";

/** Ce fel de obiect s-a atins. Prefixat cu `crm_`, ca jurnalul să fie filtrabil pe modul. */
export type CrmAuditTarget =
  | "crm_lead"
  | "crm_pipeline"
  | "crm_stage"
  | "crm_cadence"
  | "crm_reengagement_rule"
  | "crm_custom_field"
  | "crm_company";

export interface CrmAuditInput {
  tenantId: string;
  actorId?: string | null;
  /** Verbul, în clar: „lead.stage_changed", „pipeline.deleted". */
  action: string;
  target: CrmAuditTarget;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Scrie o intrare în jurnal. Nu aruncă NICIODATĂ (vezi `writeAuditLog`): o problemă la jurnal nu
 * are voie să răstoarne acțiunea pe care tocmai o descrie.
 */
export async function logCrmAudit(entry: CrmAuditInput): Promise<void> {
  await writeAuditLog({
    tenantId: entry.tenantId,
    actorId: entry.actorId ?? null,
    actionType: `crm.${entry.action}`,
    targetType: entry.target,
    targetId: entry.targetId ?? null,
    oldValue: entry.before ?? null,
    newValue: entry.after ?? null,
  });
}
