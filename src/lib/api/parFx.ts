/**
 * FX-001: clientul pentru cursul oficial BNM (secțiunea „Curs valutar" din PAR).
 *
 * Serverul face descărcarea și memorarea (server/routes/parFx.ts); aici doar tipurile și
 * apelurile. Conversia din convertor se face LOCAL, din tabloul deja încărcat — altfel fiecare
 * tastă apăsată ar fi o cerere de rețea; endpoint-ul `/convert` rămâne pentru apeluri din afara
 * paginii (script, agent, altă parte din aplicație).
 */
import { api } from "../api";

export interface FxRate {
  code: string;
  name: string;
  nominal: number;
  /** Lei pentru `nominal` unități — cum publică BNM. */
  value: number;
  /** Lei pentru O unitate. */
  mdl_per_unit: number;
  previous_mdl_per_unit: number | null;
  change: number | null;
  change_pct: number | null;
  pinned: boolean;
}

export interface FxRatesResponse {
  requested_date: string;
  effective_date: string;
  is_stale: boolean;
  base: "MDL";
  source: "BNM";
  source_url: string;
  rates: FxRate[];
}

export interface FxSeriesPoint {
  date: string;
  rates: Record<string, number>;
}

export interface FxSeriesResponse {
  codes: string[];
  days: number;
  end_date: string;
  points: FxSeriesPoint[];
}

export interface FxConvertResponse {
  from: string;
  to: string;
  amount: number;
  rate: number;
  result: number;
  requested_date: string;
  effective_date: string;
}

export function getFxRates(date?: string): Promise<FxRatesResponse> {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return api<FxRatesResponse>(`/api/par/fx/rates${q}`);
}

export function getFxSeries(codes: string[], days = 30, endDate?: string): Promise<FxSeriesResponse> {
  const params = new URLSearchParams({ codes: codes.join(","), days: String(days) });
  if (endDate) params.set("date", endDate);
  return api<FxSeriesResponse>(`/api/par/fx/series?${params.toString()}`);
}

export function convertFx(
  from: string,
  to: string,
  amount: number,
  date?: string
): Promise<FxConvertResponse> {
  const params = new URLSearchParams({ from, to, amount: String(amount) });
  if (date) params.set("date", date);
  return api<FxConvertResponse>(`/api/par/fx/convert?${params.toString()}`);
}

// ─── Aritmetica din convertor (pură, ca s-o poată testa un test unitar) ───────

/** Lei pentru o unitate din `code`, din tabloul zilei. MDL = 1. Null dacă nu e cotată. */
export function unitInMdl(rates: FxRate[], code: string): number | null {
  if (code === "MDL") return 1;
  const r = rates.find((x) => x.code === code);
  return r ? r.mdl_per_unit : null;
}

/**
 * BNM cotează totul față de leu, deci EUR→USD e un cross-rate: trece prin MDL.
 * Întoarce null dacă vreuna dintre valute nu e cotată în ziua respectivă.
 */
export function crossRate(rates: FxRate[], from: string, to: string): number | null {
  const f = unitInMdl(rates, from);
  const t = unitInMdl(rates, to);
  if (f == null || t == null || t === 0) return null;
  return f / t;
}

/** Formatare monetară cu 2 zecimale și separatorii locali. */
export function formatMoney(amount: number, currency: string): string {
  return `${new Intl.NumberFormat("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
}

/** Cursul se arată cu 4 zecimale — așa îl publică BNM. */
export function formatRate(rate: number): string {
  return new Intl.NumberFormat("ro-MD", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(rate);
}

/**
 * Variația zilnică, așa cum se AFIȘEAZĂ (două zecimale).
 *
 * Direcția se ia din valoarea rotunjită, nu din cea brută: lira sterlină a scăzut cu 0,0008 lei,
 * adică -0,004% — la două zecimale asta e zero, iar „-0,00%" cu săgeată roșie e un semnal fals.
 * Dacă la precizia arătată nu se vede nicio mișcare, spunem că nu s-a mișcat.
 */
export function pctDisplay(pct: number | null): { text: string; dir: -1 | 0 | 1 } {
  if (pct == null) return { text: "—", dir: 0 };
  const rounded = Number(pct.toFixed(2));
  const dir = rounded > 0 ? 1 : rounded < 0 ? -1 : 0;
  const formatted = new Intl.NumberFormat("ro-MD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(rounded));
  return { text: `${dir > 0 ? "+" : dir < 0 ? "−" : ""}${formatted}%`, dir };
}
