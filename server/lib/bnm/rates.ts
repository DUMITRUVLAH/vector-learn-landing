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
import { and, eq, gte, inArray, lte, desc } from "drizzle-orm";
import { db } from "../../db/client";
import { bnmRates } from "../../db/schema/bnmRates";
import { fetchBnmQuotes, type BnmQuote, type FxFetch } from "../fx";

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

/**
 * Cursurile unei zile: din oglindă dacă există, altfel de la BNM (și le memorăm).
 * O zi din viitor întoarce [] fără să lovească rețeaua — BNM n-o publică oricum.
 */
export async function getQuotesForDate(iso: string, opts: RatesOptions = {}): Promise<BnmQuote[]> {
  const cached = await readDay(iso);
  if (cached.length > 0) return cached;
  if (iso > isoDate(new Date())) return [];

  const quotes = await fetchBnmQuotes(fromIso(iso), { fetchImpl: opts.fetchImpl });
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

/**
 * Serie zilnică pentru `codes`, pe ultimele `days` zile terminate în `endIso`.
 *
 * Zilele deja memorate se citesc dintr-un singur SELECT; doar cele lipsă se descarcă, câte 4 în
 * paralel (bnm.md e un site public, nu un API cu SLA — nu-l lovim cu 30 de cereri deodată).
 */
export async function getSeries(
  codes: string[],
  days: number,
  endIso: string,
  opts: RatesOptions = {}
): Promise<SeriesPoint[]> {
  const wanted = codes.map((c) => c.toUpperCase());
  const startIso = shiftDays(endIso, -(days - 1));

  let rows: (typeof bnmRates.$inferSelect)[] = [];
  try {
    rows = await db
      .select()
      .from(bnmRates)
      .where(
        and(
          gte(bnmRates.rateDate, startIso),
          lte(bnmRates.rateDate, endIso),
          inArray(bnmRates.code, wanted)
        )
      );
  } catch {
    rows = [];
  }

  const byDate = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const bucket = byDate.get(r.rateDate) ?? {};
    bucket[r.code] = Number(r.mdlPerUnit);
    byDate.set(r.rateDate, bucket);
  }

  const today = isoDate(new Date());
  const allDates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDays(startIso, i);
    if (d <= today) allDates.push(d);
  }

  // Zi memorată = are TOATE codurile cerute; altfel o descărcăm o dată și o completăm.
  const missing = allDates.filter((d) => {
    const bucket = byDate.get(d);
    return !bucket || wanted.some((c) => bucket[c] === undefined);
  });

  const CONCURRENCY = 4;
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

  return allDates
    .map((date) => ({ date, rates: byDate.get(date) ?? {} }))
    .filter((p) => Object.keys(p.rates).length > 0);
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
