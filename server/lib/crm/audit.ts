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
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { auditLog } from "../../db/schema";
import { writeAuditLog } from "../auditLogger";

/** Ce fel de obiect s-a atins. Prefixat cu `crm_`, ca jurnalul să fie filtrabil pe modul. */
export type CrmAuditTarget =
  | "crm_lead"
  | "crm_pipeline"
  | "crm_stage"
  | "crm_cadence"
  | "crm_reengagement_rule"
  | "crm_custom_field"
  | "crm_company"
  | "crm_user"
  | "crm_invite"
  | "crm_kpi_target"
  | "crm_recall_settings";

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

/** Cheile care, oriunde ar apărea într-o intrare de jurnal, poartă date ale persoanei. */
const PII_KEYS = new Set([
  "fullName",
  "fullNameNormalized",
  "name",
  "phone",
  "phoneNormalized",
  "email",
  "emailNormalized",
  "notes",
  "consentText",
  "ipAtConsent",
  "userAgentAtConsent",
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Înlocuiește datele persoanei dintr-o valoare de jurnal (JSON arbitrar): cheile din `PII_KEYS`
 * devin `marker`, iar orice text care conține una din valorile cunoscute (numele, emailul,
 * telefonul) o pierde pe aceea. Structura rămâne — cine, ce acțiune, când, ce câmpuri —, doar
 * conținutul personal dispare. Pură, ca să se poată testa fără bază.
 */
export function scrubPii(value: unknown, piiValues: string[], marker: string): unknown {
  const needles = [...new Set(piiValues.map((v) => v.trim()).filter((v) => v.length >= 3))];
  const pattern = needles.length > 0 ? new RegExp(needles.map(escapeRegExp).join("|"), "gi") : null;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return pattern ? v.replace(pattern, marker) : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, inner] of Object.entries(v as Record<string, unknown>)) {
        out[k] = PII_KEYS.has(k) && inner !== null && inner !== undefined ? marker : walk(inner);
      }
      return out;
    }
    return v;
  };
  return walk(value);
}

/**
 * La anonimizare (dreptul la ștergere), jurnalul CRM al leadului nu are voie să rămână copia
 * datelor șterse: `lead.created` ține numele și emailul, `lead.updated` corpul brut al PATCH-ului.
 * Intrările RĂMÂN — sunt dovada a ce s-a făcut și când —, doar datele persoanei din ele dispar.
 */
export async function scrubCrmAuditPii(
  tenantId: string,
  targetId: string,
  piiValues: string[],
  marker: string
): Promise<void> {
  const rows = await db
    .select({ id: auditLog.id, oldValue: auditLog.oldValue, newValue: auditLog.newValue })
    .from(auditLog)
    .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.targetId, targetId)));
  for (const row of rows) {
    const oldValue = scrubPii(row.oldValue, piiValues, marker);
    const newValue = scrubPii(row.newValue, piiValues, marker);
    if (JSON.stringify(oldValue) === JSON.stringify(row.oldValue) && JSON.stringify(newValue) === JSON.stringify(row.newValue)) {
      continue;
    }
    await db.update(auditLog).set({ oldValue, newValue }).where(eq(auditLog.id, row.id));
  }
}
