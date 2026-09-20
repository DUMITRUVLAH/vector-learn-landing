/**
 * CRM — clientul tipat pentru normele de activitate („60 de apeluri pe săptămână").
 *
 * Norma personală bate norma generală a workspace-ului; `target: 0` ȘTERGE norma, ca un zero
 * salvat să nu se transforme într-un „0% realizat" veșnic.
 */
import { api } from "@/lib/api";

export const KPI_TARGET_METRICS = [
  "callsMade",
  "successfulContacts",
  "meetings",
  "offersSent",
  "contractsSigned",
  "salesValueCents",
  "tasksDone",
] as const;

export type KpiTargetMetric = (typeof KPI_TARGET_METRICS)[number];

/** Etichetele, aceleași cuvinte ca pe plăcuțele din Rapoarte — altfel norma pare a fi despre
 *  altceva decât cifra de lângă ea. */
export const KPI_TARGET_LABELS: Record<KpiTargetMetric, string> = {
  callsMade: "Apeluri efectuate",
  successfulContacts: "Contacte reușite",
  meetings: "Întâlniri",
  offersSent: "Oferte trimise",
  contractsSigned: "Contracte semnate",
  salesValueCents: "Valoare vânzări",
  tasksDone: "Taskuri finalizate",
};

export type KpiTargetPeriod = "week" | "month";

export interface CrmKpiTarget {
  id: string;
  userId: string | null;
  period: KpiTargetPeriod;
  metric: KpiTargetMetric;
  target: number;
}

export interface CrmKpiAttainment {
  /** Ținta SCALATĂ la perioada raportului (o normă săptămânală, privită pe 30 de zile, crește). */
  target: number;
  achieved: number;
  pct: number;
}

export function listCrmKpiTargets(): Promise<{ items: CrmKpiTarget[] }> {
  return api<{ items: CrmKpiTarget[] }>("/api/crm/kpi-targets");
}

export function setCrmKpiTarget(body: {
  userId?: string | null;
  period?: KpiTargetPeriod;
  metric: KpiTargetMetric;
  target: number;
}): Promise<CrmKpiTarget | { ok: true; removed: true }> {
  return api<CrmKpiTarget>("/api/crm/kpi-targets", { method: "PUT", body: JSON.stringify(body) });
}
