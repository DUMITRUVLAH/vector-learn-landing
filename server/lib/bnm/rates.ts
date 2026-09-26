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
import { and, eq, inArray, desc, lte } from "drizzle-orm";
import { db } from "../../db/client";
import { bnmRates } from "../../db/schema/bnmRates";
import { fetchBnmQuotes, fetchBnmQuotesCsv, type BnmQuote, type FxFetch } from "../fx";

export type { BnmQuote };

/**
 * Ce s-a întâmplat cu rețeaua în timpul UNEI cereri. Se propagă prin toate zilele parcurse ca
 * ruta să poată spune omului adevărul: „BNM n-a publicat încă" și „n-am putut ajunge la bnm.md"
 * arată la fel în date (curs mai vechi), dar sunt două situații diferite.
 */
export interface FetchState {
  /** true dacă vreo descărcare din cererea asta a eșuat fără răspuns (rețea/timeout/5xx). */
  unreachable: boolean;
}

export interface RatesOptions {
  /** Injectabil ca testele să nu atingă rețeaua. */
  fetchImpl?: FxFetch;
  /** Cât așteptăm un răspuns de la bnm.md. Scurt: suntem pe calea unei cereri HTTP. */
  timeoutMs?: number;
  /** Colector de diagnostic pentru cererea curentă (vezi `FetchState`). */
  state?: FetchState;
}

/**
 * Cât așteptăm bnm.md înainte să renunțăm. În mod normal răspunde în ~200 ms; peste 5 secunde
 * nu mai e „încet", e „nu răspunde", iar noi avem oricum oglinda locală.
 */
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Siguranța care ține pagina în viață când bnm.md nu ne mai răspunde.
 *
 * Pe 2026-09-26 cursul nu se mai încărca deloc: bnm.md a început să lase fără răspuns cererile
 * venite din centre de date (Vercel și orice IP de cloud expiră; aceleași URL-uri merg instant
 * dintr-o rețea din Moldova). Oglinda avea cursul până pe 24.09, dar nu ajungea nimeni la el:
 * o cerere pentru azi plătea 8 s pe XML + 8 s pe CSV, iar eroarea de la CSV arunca din
 * `getQuotesForDate` și oprea căutarea înapoi ÎNAINTE să ajungă la ziua memorată → 503.
 *
 * De aceea: (1) nicio descărcare nu mai aruncă în sus, (2) după primul eșec nu mai încercăm
 * rețeaua un minut — altfel fiecare deschidere de pagină plătește din nou timeout-ul pentru
 * fiecare zi lipsă.
 */
const UNREACHABLE_COOLDOWN_MS = 60_000;
let unreachableUntil = 0;

function sourceLooksReachable(): boolean {
  return Date.now() >= unreachableUntil;
}

function markSourceUnreachable(state?: FetchState): void {
  unreachableUntil = Date.now() + UNREACHABLE_COOLDOWN_MS;
  if (state) state.unreachable = true;
}

/** Test-only: repune breaker-ul pe zero, ca un test să nu-l moștenească de la altul. */
export function __resetBnmReachability(): void {
  unreachableUntil = 0;
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
  // bnm.md tocmai a refuzat o cerere: nu mai plătim încă un timeout pentru fiecare zi lipsă.
  if (!sourceLooksReachable()) {
    if (opts.state) opts.state.unreachable = true;
    return [];
  }

  const date = fromIso(iso);
  const ageDays = Math.round((Date.now() - date.getTime()) / 86_400_000);
  const useXmlFirst = ageDays <= XML_HORIZON_DAYS;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;

  // „Fără răspuns" ≠ „ziua asta n-are curs". Un `ValCurs` gol e un răspuns valid (weekend, zi
  // nepublicată, arhivă prea veche pentru XML) și se rezolvă încercând CSV-ul; o excepție
  // înseamnă că n-am vorbit deloc cu bnm.md, iar atunci CSV-ul ar eșua identic.
  let reachable = true;
  let quotes: BnmQuote[] = [];
  if (useXmlFirst) {
    try {
      quotes = await fetchBnmQuotes(date, { fetchImpl: opts.fetchImpl, timeoutMs });
    } catch {
      reachable = false;
    }
  }
  if (reachable && quotes.length === 0) {
    try {
      quotes = await fetchBnmQuotesCsv(date, { fetchImpl: opts.fetchImpl, timeoutMs });
    } catch {
      // Aici era bugul din 26.09.2026: excepția ieșea din funcție, `getEffectiveQuotes` n-o
      // prindea, iar ruta răspundea 503 fără să se mai uite în oglindă, unde cursul exista.
      reachable = false;
    }
  }
  if (!reachable) {
    markSourceUnreachable(opts.state);
    return [];
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
  /** true dacă n-am putut vorbi cu bnm.md în cererea asta (deci cursul vine din oglindă). */
  sourceUnreachable: boolean;
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
  const state: FetchState = opts.state ?? { unreachable: false };
  const withState = { ...opts, state };

  let cursor = iso;
  for (let i = 0; i <= maxBack; i++) {
    const quotes = await getQuotesForDate(cursor, withState);
    if (quotes.length > 0) {
      return { requestedDate: iso, effectiveDate: cursor, quotes, sourceUnreachable: state.unreachable };
    }
    cursor = shiftDays(cursor, -1);
  }

  // Ultima plasă: cea mai recentă zi pe care o avem memorată, oricât de veche. Un curs oficial de
  // săptămâna trecută, spus pe față ca atare, e util; o pagină goală nu e. Contează când bnm.md
  // e inaccesibil zile la rând — atunci pasul cu pasul de mai sus nu are cum să găsească nimic.
  const mirrored = await latestMirroredDay(iso);
  if (mirrored) {
    return {
      requestedDate: iso,
      effectiveDate: mirrored.date,
      quotes: mirrored.quotes,
      sourceUnreachable: state.unreachable,
    };
  }
  return { requestedDate: iso, effectiveDate: iso, quotes: [], sourceUnreachable: state.unreachable };
}

/** Cea mai recentă zi memorată la sau înaintea lui `iso`. Un singur SELECT, pe indexul de dată. */
async function latestMirroredDay(iso: string): Promise<{ date: string; quotes: BnmQuote[] } | null> {
  try {
    const [row] = await db
      .select({ d: bnmRates.rateDate })
      .from(bnmRates)
      .where(lte(bnmRates.rateDate, iso))
      .orderBy(desc(bnmRates.rateDate))
      .limit(1);
    if (!row?.d) return null;
    const quotes = await readDay(row.d);
    return quotes.length > 0 ? { date: row.d, quotes } : null;
  } catch {
    return null;
  }
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
