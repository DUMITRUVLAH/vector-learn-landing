/**
 * CRM-G09 — aranjamentul ecranului de rapoarte: ce secțiuni se văd și în ce ordine.
 *
 * Funcții pure, fără React: aranjamentul salvat vine de pe server și poate fi mai VECHI decât
 * codul (o secțiune adăugată după ce omul și-a salvat ordinea) sau mai NOU (o secțiune scoasă).
 * `resolveLayout` le împacă: cheile necunoscute se ignoră, secțiunile noi apar la locul lor
 * implicit, iar ce a ascuns omul rămâne ascuns.
 */
import type { CrmReportLayout } from "@/lib/api/crmReports";

export type ReportSectionKey =
  | "insights"
  | "metrics"
  | "wonLost"
  | "funnel"
  | "segments"
  | "team"
  | "aging"
  | "lostReasons"
  | "activity"
  | "calls";

export const REPORT_SECTIONS: { key: ReportSectionKey; label: string }[] = [
  { key: "insights", label: "Ce spun cifrele" },
  { key: "metrics", label: "Indicatori și evoluție" },
  { key: "wonLost", label: "Câștigate și pierdute" },
  { key: "funnel", label: "Pâlnia" },
  { key: "segments", label: "Conversie pe segment" },
  { key: "team", label: "Echipa" },
  { key: "aging", label: "Afaceri care stagnează" },
  { key: "lostReasons", label: "De ce pierdem" },
  { key: "activity", label: "Activitate" },
  { key: "calls", label: "Contactabilitate" },
];

const DEFAULT_ORDER = REPORT_SECTIONS.map((s) => s.key);
const KNOWN = new Set<string>(DEFAULT_ORDER);

export interface ResolvedLayout {
  order: ReportSectionKey[];
  hidden: Set<ReportSectionKey>;
  hiddenMetrics: Set<string>;
  segmentDimension: string | null;
}

export function resolveLayout(saved: CrmReportLayout | null | undefined): ResolvedLayout {
  const savedOrder = (saved?.order ?? []).filter((k): k is ReportSectionKey => KNOWN.has(k));
  const order = [...new Set(savedOrder)];
  // O secțiune pe care ordinea salvată n-o cunoaște intră după vecinul ei implicit dinaintea ei,
  // nu la coadă: „Conversie pe segment" adăugată azi trebuie să apară lângă pâlnie, nu sub tot.
  DEFAULT_ORDER.forEach((key, i) => {
    if (order.includes(key)) return;
    const before = DEFAULT_ORDER.slice(0, i).reverse().find((k) => order.includes(k));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, key);
  });
  return {
    order,
    hidden: new Set((saved?.hidden ?? []).filter((k): k is ReportSectionKey => KNOWN.has(k))),
    hiddenMetrics: new Set(saved?.hiddenMetrics ?? []),
    segmentDimension: saved?.segmentDimension ?? null,
  };
}

export function serializeLayout(l: ResolvedLayout): CrmReportLayout {
  return {
    order: l.order,
    hidden: [...l.hidden],
    hiddenMetrics: [...l.hiddenMetrics],
    segmentDimension: l.segmentDimension,
  };
}

/** Mută o secțiune cu o poziție în sus (`-1`) sau în jos (`+1`). La margini nu face nimic. */
export function moveSection(order: ReportSectionKey[], key: ReportSectionKey, dir: -1 | 1): ReportSectionKey[] {
  const i = order.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export const DEFAULT_LAYOUT: ResolvedLayout = resolveLayout(null);
