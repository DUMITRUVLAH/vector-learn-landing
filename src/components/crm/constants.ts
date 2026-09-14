/**
 * CRM (Faza 1) — constante comune pipeline-ului de leaduri: etape implicite (fallback),
 * tonuri pastel, surse și motive de pierdere. Sursa de adevăr pentru comportament:
 * `backlog/crm/CRM-CORE.md` §4-5.1 + §11 (etape configurabile, `pipeline_stages`).
 *
 * Etapele NU mai sunt un `const` fix de 5 — vin din `GET /api/crm/leads/pipeline` (`stages`)
 * și pot fi redenumite/recolorate/reordonate din `StageEditorDialog`. `CRM_DEFAULT_STAGES` de
 * mai jos există DOAR ca fallback pentru fereastra de deploy în care backend-ul e în urma
 * codului (vezi CLAUDE.md — „schema poate rămâne în urma codului"; același motiv pentru care
 * `/api/crm/leads/pipeline` degradează la o tablă goală în loc de 500 când lipsește o coloană).
 */
import type { CrmStage, CrmStageColor } from "@/lib/api/crm";

// ─── Culori pastel de etapă ─────────────────────────────────────────────────────

/** Cele 5 tonuri pastel acceptate pentru etape — design-system.md §Culori pastel. Singurele
 *  oferite în `StageEditorDialog`; orice altă valoare venită din date vechi cade pe „sky". */
export const CRM_STAGE_COLORS: readonly CrmStageColor[] = ["sky", "lavender", "peach", "mint", "rose"] as const;

/** Numele în română ale tonurilor, pentru select-ul de culoare din editorul de etape. */
export const CRM_STAGE_COLOR_LABEL: Record<CrmStageColor, string> = {
  sky: "Albastru cer",
  lavender: "Lavandă",
  peach: "Piersică",
  mint: "Verde mentă",
  rose: "Roz",
};

const STAGE_COLOR_CLASSES: Record<CrmStageColor, { bg: string; fg: string }> = {
  sky: { bg: "pastel-sky", fg: "text-pastel-sky-fg" },
  lavender: { bg: "pastel-lavender", fg: "text-pastel-lavender-fg" },
  peach: { bg: "pastel-peach", fg: "text-pastel-peach-fg" },
  mint: { bg: "pastel-mint", fg: "text-pastel-mint-fg" },
  rose: { bg: "pastel-rose", fg: "text-pastel-rose-fg" },
};

/** Cade pe „sky" pentru o culoare necunoscută (date vechi/corupte) — un board nu are voie să
 *  se rupă pentru o etapă cu o valoare de culoare pe care design system-ul n-o (mai) are. */
export function stageColorClasses(color: string): { bg: string; fg: string } {
  return STAGE_COLOR_CLASSES[color as CrmStageColor] ?? STAGE_COLOR_CLASSES.sky;
}

// ─── Etape — fallback când backend-ul e în urmă ─────────────────────────────────

/**
 * Fallback DOAR pentru fereastra de deploy în care `/api/crm/leads/pipeline` încă nu întoarce
 * `stages` (endpoint nou, backend construit în paralel). `id` = `key`, pentru că aceste obiecte
 * nu sunt niciodată trimise înapoi la server (doar afișate).
 */
export const CRM_DEFAULT_STAGES: readonly CrmStage[] = [
  { id: "new", key: "new", label: "Lead nou", color: "sky", orderIndex: 0, isWon: false, isLost: false, isDefault: true, probabilityPct: 10 },
  { id: "contacted", key: "contacted", label: "Contactat", color: "lavender", orderIndex: 1, isWon: false, isLost: false, isDefault: true, probabilityPct: 25 },
  { id: "trial", key: "trial", label: "Trial/Demo", color: "peach", orderIndex: 2, isWon: false, isLost: false, isDefault: true, probabilityPct: 50 },
  { id: "paid", key: "paid", label: "Client", color: "mint", orderIndex: 3, isWon: true, isLost: false, isDefault: true, probabilityPct: 100 },
  { id: "lost", key: "lost", label: "Pierdut", color: "rose", orderIndex: 4, isWon: false, isLost: true, isDefault: true, probabilityPct: 0 },
] as const;

/** Etichetă pentru o cheie de etapă — caută în lista de etape curentă (a tenantului), nu
 *  într-un `const` fix, altfel o etapă redenumită tot ar arăta eticheta veche. */
export function crmStageLabel(stages: readonly CrmStage[], key: string): string {
  return stages.find((s) => s.key === key)?.label ?? key;
}

// ─── Surse de lead ───────────────────────────────────────────────────────────────

/** Sursele de lead cunoscute — folosite atât la creare, cât și pe cartonaș. Fixe (enum pe
 *  server, `leadSourceEnum`) — spre deosebire de etape, nu sunt configurabile per tenant. */
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
