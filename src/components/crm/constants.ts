/**
 * CRM (Faza 1) — constante comune pipeline-ului de leaduri: stadii, tonuri
 * pastel, surse și motive de pierdere. Sursa de adevăr pentru etichete și
 * culori: `backlog/crm/CRM-CORE.md` §4-5.1.
 */
import type { CrmLeadStage } from "@/lib/api/crm";

export interface CrmStageConfig {
  key: CrmLeadStage;
  label: string;
  /** Clasă utilitară pastel (fundal) — design-system.md §Culori pastel. */
  bg: string;
  /** Clasă utilitară pastel (text), perechea lui `bg`. */
  fg: string;
}

/** Ordinea fixă a coloanelor kanban — CRM-CORE §5.1. */
export const CRM_STAGES: readonly CrmStageConfig[] = [
  { key: "new", label: "Lead nou", bg: "pastel-sky", fg: "text-pastel-sky-fg" },
  { key: "contacted", label: "Contactat", bg: "pastel-lavender", fg: "text-pastel-lavender-fg" },
  { key: "trial", label: "Trial/Demo", bg: "pastel-peach", fg: "text-pastel-peach-fg" },
  { key: "paid", label: "Client", bg: "pastel-mint", fg: "text-pastel-mint-fg" },
  { key: "lost", label: "Pierdut", bg: "pastel-rose", fg: "text-pastel-rose-fg" },
] as const;

export function crmStageLabel(stage: string): string {
  return CRM_STAGES.find((s) => s.key === stage)?.label ?? stage;
}

/** Sursele de lead cunoscute — folosite atât la creare, cât și pe cartonaș. */
export const CRM_SOURCE_LABEL: Record<string, string> = {
  webform: "Site web",
  manual: "Manual",
  facebook_ad: "Facebook",
  google_ads: "Google Ads",
  referral: "Recomandare",
  phone_in: "Telefon",
  instagram: "Instagram",
  import: "Import",
  other: "Altul",
};

export function crmSourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  return CRM_SOURCE_LABEL[source] ?? source;
}

/** Motive predefinite pentru pierderea unui lead — ultimul rămâne mereu opțiunea liberă. */
export const CRM_LOST_REASON_PRESETS = [
  "Preț prea mare",
  "Concurență",
  "Nu mai e de interes",
  "Nu răspunde",
  "Altul",
] as const;

/** Monedele acceptate — MDL prima, clientul e din Moldova. */
export const CRM_CURRENCIES = ["MDL", "EUR", "RON", "USD"] as const;
