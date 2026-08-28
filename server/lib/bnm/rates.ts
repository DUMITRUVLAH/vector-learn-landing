/**
 * FX-001: tabloul cursului oficial BNM — citit din oglinda locală, completat de la bnm.md.
 *
 * Sursa: https://www.bnm.md/ro/official_exchange_rates?get_xml=1&date=DD.MM.YYYY
 * Gratuit, fără cheie, fără limită documentată. Publică toate valutele zilei; în weekend și
 * sărbători repetă cursul ultimei zile lucrătoare, deci o dată calendaristică validă întoarce
 * aproape întotdeauna date. O dată VIITOARE întoarce XML gol — de aceea `effectiveDate` poate
 * diferi de data cerută: mergem înapoi până găsim o zi publicată.
 *
 * Cursul unei zile trecute nu se mai schimbă niciodată, deci ce am descărcat o dată rămâne în
 * `bnm_rates`. Fără persistență, un grafic pe 30 de zile ar lovi bnm.md de 30 de ori la fiecare
 * deschidere de pagină (pe Vercel memoria pornește goală la rece).
 */
import { and, eq, inArray, desc } from "drizzle-orm";
import { db } from "../../db/client";
import { bnmRates } from "../../db/schema/bnmRates";
import { fetchBnmQuotes, fetchBnmQuotesCsv, type BnmQuote, type FxFetch } from "../fx";

export type { BnmQuote };

export interface RatesOptions {
  /** Injectabil ca testele să nu atingă rețeaua. */
  fetchImpl?: FxFetch;
}

/** "YYYY-MM-DD" pentru o dată locală. */
export function isoDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** "YYYY-MM-DD" → Date locală (fără deplasare de fus, spre deosebire de `new Date(iso)`). */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Validează forma unei date ISO și că e o zi reală (respinge 2026-02-31). */
export function isValidIso(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = fromIso(iso);
  return !Number.isNaN(d.getTime()) && isoDate(d) === iso;
}

function shiftDays(iso: string, delta: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

function toQuote(row: typeof bnmRates.$inferSelect): BnmQuote {
  return {
    code: row.code,
    name: row.name,
    nominal: Number(row.nominal),
    value: Number(row.value),
    mdlPerUnit: Number(row.mdlPerUnit),
  };
}

/** Citește o zi din oglinda locală. Dacă tabela lipsește încă (deploy înaintea migrării), [] . */
async function readDay(iso: string): Promise<BnmQuote[]> {
  try {
    const rows = await db.select().from(bnmRates).where(eq(bnmRates.rateDate, iso));
    return rows.map(toQuote);
  } catch {
    return [];
  }
}

/** Scrie o zi în oglindă. Eșecul nu e fatal — cursul l-am obținut deja, doar nu-l memorăm. */
async function persistDay(iso: string, quotes: BnmQuote[]): Promise<void> {
  if (quotes.length === 0) return;
  try {
    await db
      .insert(bnmRates)
      .values(
        quotes.map((q) => ({
          rateDate: iso,
          code: q.code,
          name: q.name.slice(0, 120),
          nominal: String(q.nominal),
          value: String(q.value),
          mdlPerUnit: q.mdlPerUnit.toFixed(8),
        }))
      )
      .onConflictDoNothing();
  } catch {
    /* oglinda e un cache, nu sursa de adevăr */
  }
}

/** Câte zile în urmă mai are XML-ul BNM date. Peste asta, arhiva e doar în CSV. */
const XML_HORIZON_DAYS = 45;

/**
 * Cursurile unei zile: din oglindă dacă există, altfel de la BNM (și le memorăm).
 * O zi din viitor întoarce [] fără să lovească rețeaua — BNM n-o publică oricum.
 *
 * Sursa se alege după vechime, pentru că BNM nu servește la fel tot istoricul (vezi comentariul
 * din server/lib/fx.ts): XML pentru zilele recente (lista completă de ~40 de valute), CSV pentru
 * arhivă. Zilele recente cad pe CSV dacă XML-ul vine gol, așa că o zi de la limita orizontului
 * nu se pierde.
 */
export async function getQuotesForDate(iso: string, opts: RatesOptions = {}): Promise<BnmQuote[]> {
  const cached = await readDay(iso);
  if (cached.length > 0) return cached;
  if (iso > isoDate(new Date())) return [];

  const date = fromIso(iso);
  const ageDays = Math.round((Date.now() - date.getTime()) / 86_400_000);
  const useXmlFirst = ageDays <= XML_HORIZON_DAYS;

  let quotes: BnmQuote[] = [];
  if (useXmlFirst) {
    try {
      quotes = await fetchBnmQuotes(date, { fetchImpl: opts.fetchImpl });
    } catch {
      quotes = [];
    }
  }
  if (quotes.length === 0) {
    quotes = await fetchBnmQuotesCsv(date, { fetchImpl: opts.fetchImpl });
  }

  await persistDay(iso, quotes);
  return quotes;
}

export interface EffectiveRates {
  /** Data cerută. */
  requestedDate: string;
  /** Data pentru care BNM chiar are curs (poate fi mai veche: zi viitoare / arhivă lipsă). */
  effectiveDate: string;
  quotes: BnmQuote[];
}

/**
 * Cursurile aplicabile pentru `iso`, mergând înapoi până la `maxBack` zile dacă ziua cerută
 * n-are publicare. Întoarce quotes goale doar dacă nici măcar o săptămână în urmă nu găsim nimic
 * (adică BNM chiar e indisponibil) — caz în care apelantul spune „indisponibil", nu „zero".
 */
export async function getEffectiveQuotes(
  iso: string,
  opts: RatesOptions & { maxBack?: number } = {}
): Promise<EffectiveRates> {
  const maxBack = opts.maxBack ?? 7;
  let cursor = iso;
  for (let i = 0; i <= maxBack; i++) {
    const quotes = await getQuotesForDate(cursor, opts);
    if (quotes.length > 0) return { requestedDate: iso, effectiveDate: cursor, quotes };
    cursor = shiftDays(cursor, -1);
  }
  return { requestedDate: iso, effectiveDate: iso, quotes: [] };
}

export interface SeriesPoint {
  date: string;
  /** cod → lei pentru o unitate; lipsește dacă BNM n-a publicat valuta în ziua aceea. */
  rates: Record<string, number>;
}

export interface SeriesResult {
  points: SeriesPoint[];
  /** Pasul de eșantionare în zile (1 = zilnic). */
  step: number;
  from: string;
  to: string;
  /** true dacă am atins plafonul de descărcări și seria e încă incompletă. */
  partial: boolean;
}

export interface SeriesOptions extends RatesOptions {
  /** Câte puncte are voie să aibă graficul. Peste atât, eșantionăm mai rar. */
  maxPoints?: number;
  /** Plafon de zile descărcate ÎNTR-O cerere, ca o perioadă lungă să nu blocheze răspunsul. */
  maxFetches?: number;
}

/**
 * Serie zilnică sau eșantionată pentru `codes`, între două date.
 *
 * De ce eșantionăm: BNM servește o singură zi per cerere (n-are endpoint pe interval — verificat),
 * deci 3 ani ar însemna ~1100 de descărcări. Un grafic n-are nevoie de ele: la 3 ani, un punct la
 * ~8 zile arată exact aceeași curbă. Pasul se alege din lungimea perioadei, iar ULTIMA zi e mereu
 * inclusă — altfel graficul s-ar opri cu câteva zile înaintea prezentului.
 *
 * Zilele deja memorate se citesc dintr-un singur SELECT; doar cele lipsă se descarcă, câte 5 în
 * paralel (bnm.md e un site public, nu un API cu SLA) și cel mult `maxFetches` pe cerere.
 */
export async function getSeries(
  codes: string[],
  fromDate: string,
  toDate: string,
  opts: SeriesOptions = {}
): Promise<SeriesResult> {
  const wanted = codes.map((c) => c.toUpperCase());
  const maxPoints = opts.maxPoints ?? 130;
  // Plafon mic ÎNTR-O cerere, nu pentru că BNM n-ar face față, ci pentru că răspunsul trăiește
  // într-o funcție serverless cu timeout: mai bine trei runde scurte care lasă în urmă zilele deja
  // memorate, decât o singură cerere de 7 secunde care poate fi tăiată la jumătate.
  const maxFetches = opts.maxFetches ?? 60;

  const today = isoDate(new Date());
  const to = toDate > today ? today : toDate;
  const from = fromDate > to ? to : fromDate;

  const totalDays = Math.round((fromIso(to).getTime() - fromIso(from).getTime()) / 86_400_000) + 1;
  const step = Math.max(1, Math.ceil(totalDays / maxPoints));

  // Pornim din ULTIMA zi înapoi, ca prezentul să fie mereu un punct al graficului.
  const sampled: string[] = [];
  for (let d = to; d >= from; d = shiftDays(d, -step)) sampled.push(d);
  sampled.reverse();

  let rows: (typeof bnmRates.$inferSelect)[] = [];
  try {
    rows = await db
      .select()
      .from(bnmRates)
      .where(and(inArray(bnmRates.rateDate, sampled), inArray(bnmRates.code, wanted)));
  } catch {
    rows = [];
  }

  const byDate = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const bucket = byDate.get(r.rateDate) ?? {};
    bucket[r.code] = Number(r.mdlPerUnit);
    byDate.set(r.rateDate, bucket);
  }

  // O zi e „completă" dacă are toate codurile cerute. Excepție: arhiva veche a BNM conține doar
  // valutele principale, deci o zi memorată care nu le are pe toate NU se re-descarcă la infinit —
  // de aceea verificăm doar dacă ziua lipsește cu totul.
  // Completăm dinspre PREZENT înapoi: dacă o rundă nu ajunge pentru toată perioada, omul vede
  // întâi capătul care îl interesează (ultimele săptămâni), nu 2023 fără 2026.
  const allMissing = sampled.filter((d) => !byDate.has(d)).reverse();
  const missing = allMissing.slice(0, maxFetches);
  const partial = allMissing.length > missing.length;

  const CONCURRENCY = 5;
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const slice = missing.slice(i, i + CONCURRENCY);
    const fetched = await Promise.all(
      slice.map(async (d) => {
        try {
          return [d, await getQuotesForDate(d, opts)] as const;
        } catch {
          return [d, [] as BnmQuote[]] as const;
        }
      })
    );
    for (const [d, quotes] of fetched) {
      if (quotes.length === 0) continue;
      const bucket = byDate.get(d) ?? {};
      for (const q of quotes) {
        if (wanted.includes(q.code)) bucket[q.code] = q.mdlPerUnit;
      }
      byDate.set(d, bucket);
    }
  }

  const points = sampled
    .map((date) => ({ date, rates: byDate.get(date) ?? {} }))
    .filter((p) => Object.keys(p.rates).length > 0);

  return { points, step, from, to, partial };
}

/**
 * Conversie prin MDL (BNM cotează totul față de leu, deci EUR→USD e un cross-rate).
 * Întoarce null dacă vreuna dintre valute nu e cotată în ziua respectivă.
 */
export function convertVia(
  quotes: BnmQuote[],
  from: string,
  to: string,
  amount: number
): { rate: number; result: number } | null {
  const unit = (code: string): number | null => {
    if (code === "MDL") return 1;
    const q = quotes.find((x) => x.code === code);
    return q ? q.mdlPerUnit : null;
  };
  const fromUnit = unit(from.toUpperCase());
  const toUnit = unit(to.toUpperCase());
  if (fromUnit == null || toUnit == null || toUnit === 0) return null;
  const rate = fromUnit / toUnit;
  return { rate, result: amount * rate };
}

/** Ultima zi memorată pentru un cod — folosită doar la diagnostic. */
export async function lastStoredDate(code: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ d: bnmRates.rateDate })
      .from(bnmRates)
      .where(eq(bnmRates.code, code.toUpperCase()))
      .orderBy(desc(bnmRates.rateDate))
      .limit(1);
    return row?.d ?? null;
  } catch {
    return null;
  }
}
