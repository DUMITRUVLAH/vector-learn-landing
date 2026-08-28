/**
 * VF-203: FX rates from the National Bank of Moldova (BNM).
 *
 * BNM publishes official rates as XML:
 *   https://www.bnm.md/ro/official_exchange_rates?get_xml=1&date=DD.MM.YYYY
 * Each <Valute> has <CharCode>, <Value> (rate for <Nominal> units), <Nominal>.
 * The MDL value of 1 foreign unit = Value / Nominal.
 *
 * We parse with a tiny regex (no XML dependency), cache per (currency, date) in memory for the
 * day, and fall back to the last known rate if a fetch fails. `fetchImpl` is injectable so tests
 * never hit the network.
 */
export type FxFetch = (url: string) => Promise<{ ok: boolean; text: () => Promise<string> }>;

const cache = new Map<string, number>(); // key: `${date}:${code}` → MDL per unit
const lastKnown = new Map<string, number>(); // key: code → last successful rate

/** Format a Date as DD.MM.YYYY for the BNM endpoint. */
export function bnmDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

/** Parse the MDL value of one unit of `code` from a BNM XML string. Returns null if absent. */
export function parseBnmRate(xml: string, code: string): number | null {
  // Find the <Valute>…</Valute> block whose <CharCode> equals `code` (CharCode may not be first).
  const blockRe = /<Valute\b[^>]*>([\s\S]*?)<\/Valute>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const body = m[1];
    const cc = /<CharCode>\s*([A-Z]{3})\s*<\/CharCode>/i.exec(body)?.[1]?.toUpperCase();
    if (cc !== code.toUpperCase()) continue;
    const nominal = Number(/<Nominal>([\d.]+)<\/Nominal>/i.exec(body)?.[1] ?? "1");
    const value = Number(/<Value>([\d.,]+)<\/Value>/i.exec(body)?.[1]?.replace(",", "."));
    if (!Number.isFinite(value) || !Number.isFinite(nominal) || nominal <= 0) return null;
    return value / nominal;
  }
  return null;
}

/**
 * Returns the MDL value of one unit of `currency` on `date` (default today). MDL → 1.
 * Caches per day, falls back to the last known rate, throws only if there is no fallback either.
 */
export async function getMdlRate(
  currency: string,
  opts: { date?: Date; fetchImpl?: FxFetch } = {}
): Promise<number> {
  const code = currency.toUpperCase();
  if (code === "MDL") return 1;

  const date = opts.date ?? new Date();
  const key = `${bnmDate(date)}:${code}`;
  const cached = cache.get(key);
  if (cached != null) return cached;

  // Timeout explicit: BNM e un serviciu extern pe calea unei cereri de API (soldul unui cod de
  // buget). Fără el, o pauză la bnm.md ar ține cererea deschisă până la timeout-ul platformei;
  // cu el, cădem pe ultimul curs știut (sau pe „curs indisponibil") în câteva secunde.
  const doFetch: FxFetch =
    opts.fetchImpl ??
    ((url) => fetch(url, { signal: AbortSignal.timeout(6000) }) as unknown as ReturnType<FxFetch>);
  const url = `https://www.bnm.md/ro/official_exchange_rates?get_xml=1&date=${bnmDate(date)}`;

  try {
    const res = await doFetch(url);
    if (!res.ok) throw new Error("bnm_http_error");
    const xml = await res.text();
    const rate = parseBnmRate(xml, code);
    if (rate == null || rate <= 0) throw new Error("bnm_rate_missing");
    cache.set(key, rate);
    lastKnown.set(code, rate);
    return rate;
  } catch (err) {
    const fallback = lastKnown.get(code);
    if (fallback != null) return fallback;
    throw err instanceof Error ? err : new Error("fx_unavailable");
  }
}

/** Convert an amount in `currency` minor units to MDL minor units using the day's rate. */
export async function toMdlCents(
  amountCents: number,
  currency: string,
  opts: { date?: Date; fetchImpl?: FxFetch } = {}
): Promise<{ mdlCents: number; rate: number }> {
  const rate = await getMdlRate(currency, opts);
  return { mdlCents: Math.round(amountCents * rate), rate };
}

/**
 * Test-only: seed a rate so a test never touches the network (and gets a deterministic number).
 * Populates both the day cache and the last-known fallback.
 */
export function __primeFxRate(currency: string, rate: number, date: Date = new Date()): void {
  const code = currency.toUpperCase();
  cache.set(`${bnmDate(date)}:${code}`, rate);
  lastKnown.set(code, rate);
}

/** Test-only: clear caches so each test starts clean. */
export function __resetFxCache(): void {
  cache.clear();
  lastKnown.clear();
}

// ─── Tabloul complet al zilei ────────────────────────────────────────────────

/** O valută publicată de BNM pentru o dată. */
export interface BnmQuote {
  /** Cod ISO 4217, ex. "EUR". */
  code: string;
  /** Denumirea publicată de BNM ("Euro", "Dolar S.U.A."). */
  name: string;
  /** Câte unități valutare acoperă `value` (10 pentru ALL, 100 pentru JPY etc.). */
  nominal: number;
  /** Cursul așa cum îl publică BNM: lei pentru `nominal` unități. */
  value: number;
  /** Lei pentru O unitate — `value / nominal`. Asta se folosește la calcule. */
  mdlPerUnit: number;
}

/**
 * Parsează TOATE valutele dintr-un XML BNM, nu doar una.
 *
 * `parseBnmRate` extrage un singur cod și e calea fierbinte a conversiilor; aici avem nevoie de
 * tabloul întreg (pagina de curs valutar + convertorul, care face cross-rate prin MDL). Același
 * regex, o singură trecere — fără dependență de XML.
 */
export function parseBnmRates(xml: string): BnmQuote[] {
  const out: BnmQuote[] = [];
  const blockRe = /<Valute\b[^>]*>([\s\S]*?)<\/Valute>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const body = m[1];
    const code = /<CharCode>\s*([A-Za-z]{3})\s*<\/CharCode>/i.exec(body)?.[1]?.toUpperCase();
    if (!code) continue;
    const nominal = Number(/<Nominal>([\d.]+)<\/Nominal>/i.exec(body)?.[1] ?? "1");
    const value = Number(/<Value>([\d.,]+)<\/Value>/i.exec(body)?.[1]?.replace(",", "."));
    if (!Number.isFinite(value) || !Number.isFinite(nominal) || nominal <= 0 || value <= 0) continue;
    const name = (/<Name>([\s\S]*?)<\/Name>/i.exec(body)?.[1] ?? code).trim();
    out.push({ code, name, nominal, value, mdlPerUnit: value / nominal });
  }
  return out;
}

/** URL-ul oficial BNM pentru o zi (XML, gratuit, fără cheie). */
export function bnmXmlUrl(date: Date): string {
  return `https://www.bnm.md/ro/official_exchange_rates?get_xml=1&date=${bnmDate(date)}`;
}

/**
 * Descarcă tabloul complet al unei zile. Returnează [] dacă BNM n-are curs pentru acea dată
 * (zi viitoare, sau înainte de arhivă) — absența nu e o eroare, e „încă nepublicat".
 */
export async function fetchBnmQuotes(
  date: Date,
  opts: { fetchImpl?: FxFetch; timeoutMs?: number } = {}
): Promise<BnmQuote[]> {
  const doFetch: FxFetch =
    opts.fetchImpl ??
    ((url) =>
      fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 8000) }) as unknown as ReturnType<FxFetch>);
  const res = await doFetch(bnmXmlUrl(date));
  if (!res.ok) throw new Error("bnm_http_error");
  return parseBnmRates(await res.text());
}

// ─── Arhiva: exportul CSV ────────────────────────────────────────────────────

/**
 * BNM servește DOUĂ surse, iar diferența dintre ele nu e documentată nicăieri:
 *   - `official_exchange_rates?get_xml=1&date=` — doar zilele recente; pentru o dată din 2023
 *     întoarce un `<ValCurs>` GOL (nu o eroare), deci pare „zi fără curs";
 *   - `export-official-exchange-rates?date=` — arhiva completă, în CSV, până în anii 2010.
 *     Pentru zilele vechi conține doar valutele principale (EUR, USD, UAH, RON, RUB), ceea ce
 *     e exact ce cere un grafic pe ani.
 *
 * De aceea istoricul și selectorul de dată merg pe CSV, iar ziua curentă pe XML (listă completă).
 */
export function bnmCsvUrl(date: Date): string {
  return `https://www.bnm.md/ro/export-official-exchange-rates?date=${bnmDate(date)}`;
}

/**
 * Parsează CSV-ul BNM: `Valuta;Cod;Abr;Rata;Cursul`, cu zecimala virgulă și numele între
 * ghilimele („Dolar S.U.A."). `Rata` e nominalul, `Cursul` e valoarea pentru acel nominal.
 */
export function parseBnmCsv(csv: string): BnmQuote[] {
  const out: BnmQuote[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const cells = line.split(";");
    if (cells.length < 5) continue;
    const code = cells[2]?.replace(/"/g, "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code ?? "")) continue; // sare peste antet și subsol
    const nominal = Number(cells[3]?.replace(/"/g, "").replace(",", ".").trim());
    const value = Number(cells[4]?.replace(/"/g, "").replace(",", ".").trim());
    if (!Number.isFinite(value) || !Number.isFinite(nominal) || nominal <= 0 || value <= 0) continue;
    const name = (cells[0] ?? code).replace(/"/g, "").trim();
    out.push({ code: code as string, name, nominal, value, mdlPerUnit: value / nominal });
  }
  return out;
}

/** Descarcă o zi din arhiva CSV. [] dacă BNM n-are ziua (404 pe date viitoare). */
export async function fetchBnmQuotesCsv(
  date: Date,
  opts: { fetchImpl?: FxFetch; timeoutMs?: number } = {}
): Promise<BnmQuote[]> {
  const doFetch: FxFetch =
    opts.fetchImpl ??
    ((url) =>
      fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 8000) }) as unknown as ReturnType<FxFetch>);
  const res = await doFetch(bnmCsvUrl(date));
  if (!res.ok) return []; // 404 = zi inexistentă în arhivă, nu o defecțiune
  return parseBnmCsv(await res.text());
}
