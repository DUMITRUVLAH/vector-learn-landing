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

  const doFetch: FxFetch =
    opts.fetchImpl ?? ((url) => fetch(url) as unknown as ReturnType<FxFetch>);
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

/** Test-only: clear caches so each test starts clean. */
export function __resetFxCache(): void {
  cache.clear();
  lastKnown.clear();
}
