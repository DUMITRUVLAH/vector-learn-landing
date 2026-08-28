/**
 * Configurația raportului PAR — model pur, fără React.
 *
 * Trăiește separat de pagină din două motive: se testează fără să randezi un ecran, iar
 * graficele, exporturile și PDF-ul citesc EXACT aceleași filtre. Când construcția filtrelor era
 * copiată în fiecare apel, un filtru nou ajungea în grafic dar nu și în fișierul exportat —
 * adică două cifre diferite pentru aceeași întrebare.
 */
import type { ParReportFilters, ParSpendByItem } from "@/lib/api/par";

export const STATUS_LABELS: Record<string, string> = {
  draft: "Ciornă",
  pending_approval: "În aprobare",
  changes_requested: "Modificări",
  rejected: "Respinsă",
  approved: "Aprobată",
  in_finance: "La finanțe",
  reapproval_required: "Re-aprobare",
  paid: "Plătită",
  cancelled: "Anulată",
};


/** Ce sumă raportăm: estimatul cererii sau banii chiar plătiți. */
export type SpendBasis = "estimated" | "paid";

/** O singură definiție a „sumei" — graficul, tabelul, KPI-ul și PDF-ul trebuie să spună la fel. */
export function basisCents(item: ParSpendByItem, basis: SpendBasis): number {
  return basis === "paid" ? item.paidCents ?? 0 : item.totalCents ?? 0;
}


/** Configurația raportului — tot ce schimbă cifrele de pe ecran, într-un singur obiect. */
export interface ReportConfig {
  from: string;
  to: string;
  status: string[];
  payerId: string;
  projectId: string;
  departmentId: string;
  purpose: string;
  chargeTo: string;
  currency: string;
  q: string;
  basis: SpendBasis;
  topN: number;
  tab: ReportTab;
}

export type ReportTab = "payer" | "budget" | "department" | "project" | "vendor" | "event" | "charge";

export const EMPTY_CONFIG: ReportConfig = {
  from: "", to: "", status: [], payerId: "", projectId: "", departmentId: "",
  purpose: "", chargeTo: "", currency: "", q: "", basis: "estimated", topN: 10, tab: "budget",
};

const CONFIG_KEY = "par.reports.config.v1";

/** Configurația supraviețuiește navigării ȘI reîncărcării — un raport pe care îl reconstruiești
 *  din zero la fiecare intrare nu e un raport, e o corvoadă. */
export function loadReportConfig(): ReportConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return EMPTY_CONFIG;
    const parsed = JSON.parse(raw) as Partial<ReportConfig>;
    return {
      ...EMPTY_CONFIG,
      ...parsed,
      status: Array.isArray(parsed.status) ? parsed.status : [],
      topN: typeof parsed.topN === "number" ? parsed.topN : 10,
    };
  } catch {
    return EMPTY_CONFIG;
  }
}

export function saveReportConfig(cfg: ReportConfig) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch { /* stocare plină/blocată */ }
}

/** Traduce configurația în filtrele API. Un singur loc — graficele, exporturile și PDF-ul
 *  trebuie să întrebe EXACT același lucru. */
export function configToFilters(cfg: ReportConfig): ParReportFilters {
  return {
    period_from: cfg.from || undefined,
    period_to: cfg.to || undefined,
    status: cfg.status.length ? cfg.status.join(",") : undefined,
    payer_id: cfg.payerId || undefined,
    project_id: cfg.projectId || undefined,
    department_id: cfg.departmentId || undefined,
    purpose: cfg.purpose || undefined,
    charge_to: cfg.chargeTo || undefined,
    currency: cfg.currency || undefined,
    q: cfg.q || undefined,
  };
}

export const PURPOSE_LABELS: Record<string, string> = {
  execute_payment: "Executare plată",
  obtain_quotations: "Obținere oferte",
  provide_estimate: "Estimare costuri",
};

export const CHARGE_LABELS: Record<string, string> = {
  program: "Program",
  admin: "Administrativ",
  other: "Altele",
};

/** Filtrele active, în cuvinte — apar ca etichete pe ecran ȘI în antetul PDF-ului. */
export function activeFilterLabels(
  cfg: ReportConfig,
  names: { payers: Record<string, string>; projects: Record<string, string>; departments: Record<string, string> },
): string[] {
  const out: string[] = [];
  if (cfg.status.length) out.push(`Status: ${cfg.status.map((st) => STATUS_LABELS[st] ?? st).join(", ")}`);
  if (cfg.payerId) out.push(`Plătitor: ${names.payers[cfg.payerId] ?? "—"}`);
  if (cfg.projectId) out.push(`Proiect: ${names.projects[cfg.projectId] ?? "—"}`);
  if (cfg.departmentId) out.push(`Departament: ${names.departments[cfg.departmentId] ?? "—"}`);
  if (cfg.purpose) out.push(`Scop: ${PURPOSE_LABELS[cfg.purpose] ?? cfg.purpose}`);
  if (cfg.chargeTo) out.push(`Charge To: ${CHARGE_LABELS[cfg.chargeTo] ?? cfg.chargeTo}`);
  if (cfg.currency) out.push(`Monedă: ${cfg.currency}`);
  if (cfg.q.trim()) out.push(`Căutare: „${cfg.q.trim()}"`);
  return out;
}

