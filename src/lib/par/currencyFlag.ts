/**
 * FX-001: steagul unei valute, derivat din codul ISO 4217 — fără dependență, fără imagini.
 *
 * Primele două litere ale codului valutar sunt, aproape întotdeauna, codul ISO 3166 al țării
 * (USD→US, RON→RO, UAH→UA), iar din două litere se construiește emoji-ul de steag mutându-le în
 * blocul „regional indicator". Excepțiile reale sunt puține și le tratăm explicit:
 *   - EUR → 🇪🇺 (moneda unei uniuni, nu a unei țări);
 *   - codurile care încep cu X (XDR, XAU, XAG…) nu au țară — nu inventăm un steag.
 *
 * Steagul e DECORATIV: codul și denumirea valutei stau întotdeauna lângă el, așa că pe
 * platformele care nu randează emoji de steag (Windows arată cele două litere) nu se pierde
 * nicio informație.
 */

/** Valute a căror țară nu se citește din primele două litere. */
const COUNTRY_OVERRIDES: Record<string, string | null> = {
  EUR: "EU",
  // Drepturile speciale de tragere (FMI) nu aparțin unei țări.
  XDR: null,
};

/** Stiva de fonturi care chiar are glife de emoji, indiferent de sistem. */
export const EMOJI_FONT_STACK =
  '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

/** Codul de țară ISO 3166 pentru o valută, sau null dacă nu are unul. */
export function countryOf(code: string): string | null {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(cc)) return null;
  if (cc in COUNTRY_OVERRIDES) return COUNTRY_OVERRIDES[cc];
  if (cc.startsWith("X")) return null;
  return cc.slice(0, 2);
}

/** Emoji-ul de steag pentru o valută, sau null când valuta n-are țară. */
export function flagOf(code: string): string | null {
  const country = countryOf(code);
  if (!country) return null;
  return String.fromCodePoint(
    ...country.split("").map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)
  );
}
