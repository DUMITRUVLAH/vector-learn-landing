// CRM-G02 — ce îi lipsea raportului ca să fie raportul unui CRM de vânzări.
//
// Ownerul: „rapoartele sunt proaste". Raportul existent număra activitate (apeluri, taskuri,
// leaduri alocate) dar nu răspundea la cele cinci întrebări cu care un manager deschide
// rapoartele în Pipedrive sau HubSpot:
//   1. Câștigăm mai des sau mai rar decât luna trecută?   → rata de câștig + perioada precedentă
//   2. Cât valorează o afacere tipică?                    → valoarea medie a afacerii câștigate
//   3. De unde vin clienții care chiar cumpără?           → rezultatele pe sursă
//   4. Unde se înțepenesc afacerile?                      → timpul petrecut în fiecare etapă
//   5. Ce afaceri mor în tăcere chiar acum?               → vechimea afacerilor deschise + lista
//
// Aceleași reguli ca în reports.ts, fiindcă cifrele trebuie să se potrivească între ele pe
// același ecran: câștigat/pierdut se citește DOAR din flagurile etapei, iar momentul câștigului
// este PRIMA tranziție reală către o etapă câștigată (nu starea curentă, care nu știe CÂND).

import { inRange, type DateRange, type ReportStage, type StageChange } from "./reports";

const DAY_MS = 86_400_000;

/** Leadul, cu ce le trebuie analizelor de aici în plus față de `ReportLead`. */
export interface InsightLead {
  id: string;
  stage: string;
  assignedTo: string | null;
  valueCents: number;
  createdAt: string;
  source?: string | null;
  fullName?: string | null;
  company?: string | null;
  dealName?: string | null;
}

const wonKeys = (stages: ReportStage[]) => new Set(stages.filter((s) => s.isWon).map((s) => s.key));
const lostKeys = (stages: ReportStage[]) => new Set(stages.filter((s) => s.isLost).map((s) => s.key));

/** Prima tranziție a fiecărui lead către o etapă din `keys`. */
function firstTransitionTo(changes: StageChange[], keys: Set<string>): Map<string, string> {
  const first = new Map<string, string>();
  for (const ch of changes) {
    if (!ch.leadId || !ch.to || !ch.occurredAt || !keys.has(ch.to)) continue;
    const prev = first.get(ch.leadId);
    if (!prev || ch.occurredAt < prev) first.set(ch.leadId, ch.occurredAt);
  }
  return first;
}

// ─── Perioada precedentă ─────────────────────────────────────────────────────

/**
 * Perioada de aceeași lungime, imediat înainte. „Luna aceasta" (1–30 sept.) se compară cu
 * 2–31 aug., nu cu „august întreg" — altfel o lună de 31 de zile ar avea mereu un avantaj.
 * `null` pentru „tot timpul": n-are un „înainte".
 */
export function previousRange(range: DateRange, now: Date = new Date()): DateRange | null {
  if (!range.from) return null;
  const from = new Date(range.from).getTime();
  const to = range.to ? new Date(range.to).getTime() : now.getTime();
  if (!(to > from)) return null;
  const span = to - from;
  return { from: new Date(from - span).toISOString(), to: new Date(from).toISOString() };
}

// ─── Rezultate: câștigat / pierdut / rată / valoare medie ────────────────────

export interface DealOutcomes {
  newLeads: number;
  wonCount: number;
  wonValueCents: number;
  lostCount: number;
  lostValueCents: number;
  /** Câștigate din DECISE (câștigate + pierdute). `null` când nu s-a decis nimic — un 0% ar
   *  acuza o echipă care pur și simplu n-a închis încă nicio afacere în perioada asta. */
  winRatePct: number | null;
  /** Valoarea medie a unei afaceri câștigate. `null` fără câștiguri. */
  avgDealCents: number | null;
}

export function dealOutcomes(
  leads: InsightLead[],
  changes: StageChange[],
  stages: ReportStage[],
  range: DateRange,
  ownerKey?: string
): DealOutcomes {
  const owned = (l: InsightLead | undefined) => !!l && (!ownerKey || l.assignedTo === ownerKey);
  const byId = new Map(leads.map((l) => [l.id, l]));

  let newLeads = 0;
  for (const l of leads) if (owned(l) && inRange(l.createdAt, range)) newLeads++;

  let wonCount = 0;
  let wonValueCents = 0;
  for (const [id, at] of firstTransitionTo(changes, wonKeys(stages))) {
    const lead = byId.get(id);
    if (!owned(lead) || !inRange(at, range)) continue;
    wonCount++;
    wonValueCents += lead?.valueCents ?? 0;
  }

  let lostCount = 0;
  let lostValueCents = 0;
  for (const [id, at] of firstTransitionTo(changes, lostKeys(stages))) {
    const lead = byId.get(id);
    if (!owned(lead) || !inRange(at, range)) continue;
    lostCount++;
    lostValueCents += lead?.valueCents ?? 0;
  }

  const decided = wonCount + lostCount;
  return {
    newLeads,
    wonCount,
    wonValueCents,
    lostCount,
    lostValueCents,
    winRatePct: decided ? Math.round((wonCount / decided) * 100) : null,
    avgDealCents: wonCount ? Math.round(wonValueCents / wonCount) : null,
  };
}

// ─── Pe sursă ────────────────────────────────────────────────────────────────

export interface SourceRow {
  source: string;
  leads: number;
  won: number;
  lost: number;
  open: number;
  wonValueCents: number;
  winRatePct: number | null;
}

/**
 * Leadurile INTRATE în perioadă, pe sursă, și ce s-a ales de ele până azi.
 *
 * E o analiză de cohortă, intenționat: întrebarea este „merită Facebook-ul?", deci se urmăresc
 * leadurile venite de acolo în perioada aleasă, oricând s-ar fi închis ele. O sursă cu multe
 * leaduri și rată mică de câștig costă timp de vânzător — tabelul ăsta o face vizibilă.
 */
export function sourceBreakdown(leads: InsightLead[], stages: ReportStage[], range: DateRange): SourceRow[] {
  const won = wonKeys(stages);
  const lost = lostKeys(stages);
  const rows = new Map<string, SourceRow>();
  for (const l of leads) {
    if (!inRange(l.createdAt, range)) continue;
    const key = l.source || "other";
    const row = rows.get(key) ?? { source: key, leads: 0, won: 0, lost: 0, open: 0, wonValueCents: 0, winRatePct: null };
    row.leads++;
    if (won.has(l.stage)) {
      row.won++;
      row.wonValueCents += l.valueCents ?? 0;
    } else if (lost.has(l.stage)) row.lost++;
    else row.open++;
    rows.set(key, row);
  }
  return [...rows.values()]
    .map((r) => ({ ...r, winRatePct: r.won + r.lost ? Math.round((r.won / (r.won + r.lost)) * 100) : null }))
    .sort((a, b) => b.wonValueCents - a.wonValueCents || b.leads - a.leads);
}

// ─── Afacerile deschise: vechime și stagnare ─────────────────────────────────

export interface AgingBucket {
  key: "fresh" | "week" | "month" | "stale";
  label: string;
  count: number;
  valueCents: number;
}

export interface StaleDeal {
  id: string;
  title: string;
  stage: string;
  valueCents: number;
  daysIdle: number;
  assignedTo: string | null;
}

/** Peste câte zile fără nicio atingere o afacere deschisă e considerată „în stagnare". */
export const STALE_AFTER_DAYS = 14;

/**
 * Cât de vechi e ULTIMUL semn de viață al fiecărei afaceri deschise (apel, notă, e-mail, mutare
 * de etapă; în lipsa lor, crearea). Nu vechimea leadului: o afacere de trei luni lucrată ieri e
 * sănătoasă, una de o săptămână neatinsă de o săptămână deja se răcește.
 */
export function openDealAging(
  leads: InsightLead[],
  stages: ReportStage[],
  lastActivityAt: ReadonlyMap<string, string>,
  now: Date = new Date(),
  staleLimit = 10
): { buckets: AgingBucket[]; stale: StaleDeal[]; staleCount: number; staleValueCents: number } {
  const closed = new Set(stages.filter((s) => s.isWon || s.isLost).map((s) => s.key));
  const buckets: AgingBucket[] = [
    { key: "fresh", label: "0–7 zile", count: 0, valueCents: 0 },
    { key: "week", label: "8–14 zile", count: 0, valueCents: 0 },
    { key: "month", label: "15–30 zile", count: 0, valueCents: 0 },
    { key: "stale", label: "Peste 30 de zile", count: 0, valueCents: 0 },
  ];
  const stale: StaleDeal[] = [];

  for (const l of leads) {
    if (closed.has(l.stage)) continue;
    const last = lastActivityAt.get(l.id) ?? l.createdAt;
    const days = Math.max(0, Math.floor((now.getTime() - new Date(last).getTime()) / DAY_MS));
    const bucket = days <= 7 ? buckets[0] : days <= 14 ? buckets[1] : days <= 30 ? buckets[2] : buckets[3];
    bucket.count++;
    bucket.valueCents += l.valueCents ?? 0;
    if (days > STALE_AFTER_DAYS) {
      stale.push({
        id: l.id,
        title: dealTitle(l),
        stage: l.stage,
        valueCents: l.valueCents ?? 0,
        daysIdle: days,
        assignedTo: l.assignedTo,
      });
    }
  }

  // Cele mai scumpe întâi: dintre două afaceri uitate, cea de 48.000 cere telefonul azi.
  stale.sort((a, b) => b.valueCents - a.valueCents || b.daysIdle - a.daysIdle);
  // Suma pe TOATE afacerile în stagnare, nu doar pe cele listate: „cât stă neatins" e cifra pe
  // care o citește managerul, iar lista e doar începutul ei.
  const staleValueCents = stale.reduce((n, s) => n + s.valueCents, 0);
  return { buckets, stale: stale.slice(0, staleLimit), staleCount: stale.length, staleValueCents };
}

/** Numele afacerii cum îl spune un vânzător: firma, apoi omul, apoi ce s-a vândut. */
export function dealTitle(l: Pick<InsightLead, "company" | "fullName" | "dealName">): string {
  return l.company?.trim() || l.fullName?.trim() || l.dealName?.trim() || "Fără nume";
}

// ─── Timpul petrecut în fiecare etapă ────────────────────────────────────────

export interface StageVelocityRow {
  key: string;
  avgDays: number | null;
  /** Câte treceri încheiate stau la baza mediei — o medie din 2 treceri nu e o regulă. */
  samples: number;
}

/**
 * Media zilelor petrecute într-o etapă, din trecerile ÎNCHEIATE (leadul a intrat și a ieșit).
 * O afacere aflată încă în etapă nu intră: „a stat 3 zile până acum" nu e cât stă de fapt.
 *
 * Intrarea în prima etapă e momentul creării; fiecare tranziție închide etapa din care pleacă.
 */
export function stageVelocity(
  leads: InsightLead[],
  changes: StageChange[],
  stages: ReportStage[]
): StageVelocityRow[] {
  const byLead = new Map<string, StageChange[]>();
  for (const ch of changes) {
    if (!ch.leadId || !ch.occurredAt) continue;
    const list = byLead.get(ch.leadId) ?? [];
    list.push(ch);
    byLead.set(ch.leadId, list);
  }

  const total = new Map<string, number>();
  const count = new Map<string, number>();
  for (const lead of leads) {
    const list = byLead.get(lead.id);
    if (!list?.length) continue;
    list.sort((a, b) => ((a.occurredAt ?? "") < (b.occurredAt ?? "") ? -1 : 1));
    let stage = list[0].from ?? null;
    let enteredAt = lead.createdAt;
    for (const ch of list) {
      const at = ch.occurredAt as string;
      if (stage) {
        const days = (new Date(at).getTime() - new Date(enteredAt).getTime()) / DAY_MS;
        if (days >= 0) {
          total.set(stage, (total.get(stage) ?? 0) + days);
          count.set(stage, (count.get(stage) ?? 0) + 1);
        }
      }
      stage = ch.to ?? null;
      enteredAt = at;
    }
  }

  return stages.map((s) => {
    const n = count.get(s.key) ?? 0;
    return { key: s.key, samples: n, avgDays: n ? Math.round(((total.get(s.key) ?? 0) / n) * 10) / 10 : null };
  });
}

// ─── Clasamentul echipei ─────────────────────────────────────────────────────

export interface OwnerOutcomeRow {
  ownerKey: string;
  wonCount: number;
  wonValueCents: number;
  lostCount: number;
  winRatePct: number | null;
  avgDealCents: number | null;
  openCount: number;
  openValueCents: number;
}

/** Rezultatele fiecărui agent, cu aceeași `dealOutcomes` ca plăcuțele echipei. */
export function ownerOutcomes(
  leads: InsightLead[],
  changes: StageChange[],
  stages: ReportStage[],
  range: DateRange,
  owners: ReadonlyArray<{ id: string }>
): OwnerOutcomeRow[] {
  const closed = new Set(stages.filter((s) => s.isWon || s.isLost).map((s) => s.key));
  return owners.map((o) => {
    const out = dealOutcomes(leads, changes, stages, range, o.id);
    let openCount = 0;
    let openValueCents = 0;
    for (const l of leads) {
      if (l.assignedTo !== o.id || closed.has(l.stage)) continue;
      openCount++;
      openValueCents += l.valueCents ?? 0;
    }
    return {
      ownerKey: o.id,
      wonCount: out.wonCount,
      wonValueCents: out.wonValueCents,
      lostCount: out.lostCount,
      winRatePct: out.winRatePct,
      avgDealCents: out.avgDealCents,
      openCount,
      openValueCents,
    };
  });
}

/** Tranzițiile către etape pierdute, pe intervale — ca graficul să arate și ce se pierde. */
export function lostTimeline(
  changes: StageChange[],
  stages: ReportStage[],
  range: DateRange,
  bucketOf: (iso: string) => string
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [, at] of firstTransitionTo(changes, lostKeys(stages))) {
    if (!inRange(at, range)) continue;
    const key = bucketOf(at);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}
