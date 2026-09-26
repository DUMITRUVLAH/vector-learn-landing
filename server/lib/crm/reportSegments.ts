// CRM-G09 — rapoartele pe segment și insighturile generate automat.
//
// Ownerul (2026-09-26): „automat să genereze insight, gen cel mai performant agent de vânzări
// sau, dacă într-un câmp e vorba de sursă, să apară: cea mai bună conversie o are sursa X, cea
// mai rea Y — și la fel pentru oraș, industrie etc."
//
// Două piese, amândouă pure (fără bază), ca să se poată testa pe cifre scrise de mână:
//
//  1. `segmentBreakdown` — pentru O dimensiune (sursă, produs, industrie, regiune, agent, orice
//     câmp personalizat), leadurile intrate în perioadă și ce s-a ales de ele. Aceeași regulă ca
//     `sourceBreakdown`: cohorta = leadurile CREATE în perioadă; câștigat/pierdut = etapa curentă.
//
//  2. `buildInsights` — frazele de sus ale raportului. Întoarce OBIECTE (tip + cifre), nu text:
//     banii și etichetele se formatează în interfață, la fel ca restul ecranului, și un test poate
//     verifica „cine a ieșit primul" fără să compare propoziții.
//
// Regula care ține insighturile cinstite: **niciun clasament pe eșantioane mici**. „Sursa X are
// 100% conversie" dintr-un singur lead e zgomot care ar trimite bugetul de marketing în locul
// greșit. De aceea o valoare intră în comparație doar de la `MIN_SEGMENT_LEADS` leaduri, iar un
// agent intră la „cea mai bună rată" doar de la `MIN_DECIDED` afaceri închise. Numărul din care
// s-a calculat procentul pleacă mereu împreună cu el, ca omul să judece singur cât cântărește.

import { inRange, type DateRange, type ReportStage } from "./reports";

/** De la câte leaduri o valoare a unui segment intră în „cea mai bună / cea mai slabă". */
export const MIN_SEGMENT_LEADS = 3;
/** De la câte afaceri închise (câștigate + pierdute) un agent intră la „cea mai bună rată". */
export const MIN_DECIDED = 3;
/** Sub ce procent de cădere o etapă nu e semnalată ca „aici se pierd afacerile". */
const LEAK_MIN_DROP_PCT = 30;
/** Câte valori distincte poate avea un câmp text ca să merite un raport pe el. Peste asta e
 *  text liber (nume, adrese), iar un tabel cu 400 de rânduri de câte un lead nu spune nimic. */
export const MAX_SEGMENT_VALUES = 40;

/** Leadul, cu valorile tuturor dimensiunilor deja rezolvate (numele produsului, industria firmei). */
export interface SegmentLead {
  id: string;
  stage: string;
  assignedTo: string | null;
  valueCents: number;
  createdAt: string;
  /** cheia dimensiunii → valoarea (text); `null`/gol = necompletat. */
  values: Record<string, string | null | undefined>;
}

export interface SegmentDimensionDef {
  key: string;
  label: string;
  /** `builtin` = coloană din bază; `custom` = câmp personalizat al workspace-ului. */
  kind: "builtin" | "custom";
}

export interface SegmentRow {
  /** Valoarea brută (`facebook_ad`, `Chișinău`); `""` = necompletat. */
  value: string;
  leads: number;
  won: number;
  lost: number;
  open: number;
  wonValueCents: number;
  /** Din leadurile intrate, câte au devenit clienți — „conversia" din limbajul ownerului. */
  conversionPct: number;
  /** Din afacerile închise, câte s-au câștigat. `null` = nimic închis încă. */
  winRatePct: number | null;
}

export interface SegmentDimension extends SegmentDimensionDef {
  rows: SegmentRow[];
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

export function segmentBreakdown(
  leads: SegmentLead[],
  stages: ReportStage[],
  range: DateRange,
  dimensionKey: string
): SegmentRow[] {
  const won = new Set(stages.filter((s) => s.isWon).map((s) => s.key));
  const lost = new Set(stages.filter((s) => s.isLost).map((s) => s.key));
  const rows = new Map<string, SegmentRow>();
  for (const l of leads) {
    if (!inRange(l.createdAt, range)) continue;
    const value = (l.values[dimensionKey] ?? "").trim();
    const row = rows.get(value) ?? { value, leads: 0, won: 0, lost: 0, open: 0, wonValueCents: 0, conversionPct: 0, winRatePct: null };
    row.leads++;
    if (won.has(l.stage)) {
      row.won++;
      row.wonValueCents += l.valueCents ?? 0;
    } else if (lost.has(l.stage)) row.lost++;
    else row.open++;
    rows.set(value, row);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, conversionPct: pct(r.won, r.leads), winRatePct: r.won + r.lost ? pct(r.won, r.won + r.lost) : null }))
    // Necompletatul la coadă: e o constatare despre date, nu un segment de comparat.
    .sort((a, b) => (a.value === "") !== (b.value === "") ? (a.value === "" ? 1 : -1) : b.wonValueCents - a.wonValueCents || b.leads - a.leads);
}

/**
 * Toate dimensiunile care au ce arăta: cel puțin o valoare completată în perioadă și nu mai mult
 * de `MAX_SEGMENT_VALUES` valori distincte. Ordinea din `defs` se păstrează.
 */
export function segmentDimensions(
  leads: SegmentLead[],
  stages: ReportStage[],
  range: DateRange,
  defs: SegmentDimensionDef[]
): SegmentDimension[] {
  const out: SegmentDimension[] = [];
  for (const def of defs) {
    const rows = segmentBreakdown(leads, stages, range, def.key);
    const filled = rows.filter((r) => r.value !== "");
    if (filled.length === 0 || filled.length > MAX_SEGMENT_VALUES) continue;
    out.push({ ...def, rows });
  }
  return out;
}

// ─── Insighturile ────────────────────────────────────────────────────────────

export interface SegmentPick {
  value: string;
  conversionPct: number;
  leads: number;
  won: number;
  wonValueCents: number;
}

export type CrmInsight =
  | { kind: "topSeller"; tone: "positive"; ownerKey: string; wonValueCents: number; wonCount: number; sharePct: number; sellers: number }
  | { kind: "bestWinRate"; tone: "positive"; ownerKey: string; winRatePct: number; decided: number }
  | {
      kind: "segmentSpread";
      tone: "neutral";
      dimension: string;
      dimensionLabel: string;
      dimensionKind: "builtin" | "custom";
      best: SegmentPick;
      worst: SegmentPick;
    }
  | { kind: "funnelLeak"; tone: "negative"; stageKey: string; stageLabel: string; dropRatePct: number; dropped: number; reached: number }
  | { kind: "stale"; tone: "negative"; count: number; valueCents: number }
  | { kind: "topLostReason"; tone: "negative"; reason: string; pct: number; count: number }
  | { kind: "salesTrend"; tone: "positive" | "negative"; changePct: number; currentCents: number; previousCents: number };

export interface InsightInput {
  /** Rezultatele pe agent din perioadă (`ownerOutcomes`). Gol când raportul e pe un singur agent. */
  leaderboard: { ownerKey: string; wonCount: number; wonValueCents: number; lostCount: number; winRatePct: number | null }[];
  dimensions: SegmentDimension[];
  funnel: { key: string; label: string; isWon: boolean; isLost: boolean; reached: number; dropped: number; dropRatePct: number }[];
  aging: { staleCount: number; staleValueCents: number } | null;
  lostReasons: { reason: string; count: number; pct: number }[];
  sales: { currentCents: number; previousCents: number | null };
}

function pick(r: SegmentRow): SegmentPick {
  return { value: r.value, conversionPct: r.conversionPct, leads: r.leads, won: r.won, wonValueCents: r.wonValueCents };
}

/** Cea mai bună și cea mai slabă valoare a unei dimensiuni — sau `null` dacă n-au ce compara. */
export function segmentSpread(rows: SegmentRow[]): { best: SegmentPick; worst: SegmentPick } | null {
  const eligible = rows.filter((r) => r.value !== "" && r.leads >= MIN_SEGMENT_LEADS);
  if (eligible.length < 2) return null;
  // La egalitate de procent: mai multe leaduri = constatare mai solidă (și, la „cea mai slabă",
  // zero din 12 cântărește mai mult decât zero din 3).
  const best = [...eligible].sort((a, b) => b.conversionPct - a.conversionPct || b.leads - a.leads)[0];
  const worst = [...eligible].sort((a, b) => a.conversionPct - b.conversionPct || b.leads - a.leads)[0];
  if (best.value === worst.value || best.conversionPct === worst.conversionPct) return null;
  return { best: pick(best), worst: pick(worst) };
}

export function buildInsights(input: InsightInput): CrmInsight[] {
  const out: CrmInsight[] = [];

  // 1 · Cine vinde. Doar când sunt măcar doi oameni care au vândut: „singurul vânzător e cel mai
  //     bun vânzător" nu e un insight.
  const sellers = input.leaderboard.filter((r) => r.wonCount > 0);
  if (sellers.length >= 2) {
    const total = sellers.reduce((n, r) => n + r.wonValueCents, 0);
    const top = [...sellers].sort((a, b) => b.wonValueCents - a.wonValueCents || b.wonCount - a.wonCount)[0];
    out.push({
      kind: "topSeller",
      tone: "positive",
      ownerKey: top.ownerKey,
      wonValueCents: top.wonValueCents,
      wonCount: top.wonCount,
      sharePct: pct(top.wonValueCents, total),
      sellers: sellers.length,
    });
    const rated = input.leaderboard.filter((r) => r.winRatePct != null && r.wonCount + r.lostCount >= MIN_DECIDED);
    if (rated.length >= 2) {
      const best = [...rated].sort((a, b) => (b.winRatePct ?? 0) - (a.winRatePct ?? 0) || b.wonCount + b.lostCount - (a.wonCount + a.lostCount))[0];
      // Același om ca la vânzări: fraza ar repeta un nume, nu ar spune ceva nou.
      if (best.ownerKey !== top.ownerKey) {
        out.push({ kind: "bestWinRate", tone: "positive", ownerKey: best.ownerKey, winRatePct: best.winRatePct ?? 0, decided: best.wonCount + best.lostCount });
      }
    }
  }

  // 2 · Vânzările față de perioada precedentă.
  const { currentCents, previousCents } = input.sales;
  if (previousCents != null && previousCents > 0 && currentCents !== previousCents) {
    const changePct = Math.round(((currentCents - previousCents) / previousCents) * 100);
    if (changePct !== 0) {
      out.push({ kind: "salesTrend", tone: changePct > 0 ? "positive" : "negative", changePct, currentCents, previousCents });
    }
  }

  // 3 · Fiecare dimensiune cu o diferență reală între cea mai bună și cea mai slabă valoare.
  //     Agentul are deja frazele lui mai sus.
  for (const dim of input.dimensions) {
    if (dim.key === "owner") continue;
    const spread = segmentSpread(dim.rows);
    if (!spread) continue;
    out.push({ kind: "segmentSpread", tone: "neutral", dimension: dim.key, dimensionLabel: dim.label, dimensionKind: dim.kind, ...spread });
  }

  // 4 · Unde se pierd afacerile: etapa cu cea mai mare cădere, pe un eșantion care contează.
  const leak = input.funnel
    .filter((r) => !r.isWon && !r.isLost && r.reached >= MIN_SEGMENT_LEADS && r.dropRatePct >= LEAK_MIN_DROP_PCT)
    .sort((a, b) => b.dropRatePct - a.dropRatePct || b.dropped - a.dropped)[0];
  if (leak) {
    out.push({ kind: "funnelLeak", tone: "negative", stageKey: leak.key, stageLabel: leak.label, dropRatePct: leak.dropRatePct, dropped: leak.dropped, reached: leak.reached });
  }

  // 5 · Banii care stau.
  if (input.aging && input.aging.staleCount > 0) {
    out.push({ kind: "stale", tone: "negative", count: input.aging.staleCount, valueCents: input.aging.staleValueCents });
  }

  // 6 · De ce pierdem — doar când un motiv chiar domină.
  const topReason = input.lostReasons[0];
  if (topReason && topReason.count >= 2 && topReason.pct >= 30) {
    out.push({ kind: "topLostReason", tone: "negative", reason: topReason.reason, pct: topReason.pct, count: topReason.count });
  }

  return out;
}
