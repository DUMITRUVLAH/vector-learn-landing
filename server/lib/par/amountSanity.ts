/**
 * Suma citită de model, verificată față de TEXTUL documentului din care a citit-o.
 *
 * De ce există (actele reale ATIC, 24.09.2026 — rejucate prin extractor):
 *
 *  • Banii dispăreau. Promptul cerea suma „în UNITĂȚI ÎNTREGI" și toate exemplele aveau „,00", așa
 *    că modelul a învățat să taie zecimalele: 1 508,51 → 1508, 9 645,41 → 9645, 1 136,36 EUR → 1136.
 *    Pe factura AGEPI rândurile 602,84 + 9 042,57 au ajuns 602 + 9042 în formular, iar cererea s-a
 *    plătit cu 1,41 lei mai puțin decât factura. Promptul e reparat, dar un model tot poate rotunji —
 *    de aceea banii se recuperează aici, din text, determinist.
 *
 *  • Un identificator citit ca sumă. Pe extrasul Moldcell modelul a întors 1 006 600 034 927,00 lei —
 *    codul fiscal ATIC; pe factura NEWS MAKER, 758 854,00 lei — numărul facturii EBK000758854.
 *    Avertismentul „suma nu corespunde" cu o cifră absurdă arată a zgomot, iar zgomotul se ignoră:
 *    exact pe cererea aceea s-a plătit dublul facturii fără ca nimeni să se oprească.
 *
 * Pur: fără I/O. Fără text (act scanat trimis modelului ca imagine) totul trece neatins — nu avem
 * cu ce verifica, deci nu corectăm.
 */

/** O sumă cu exact două zecimale, în formele de pe actele din RM: „1 508,51", „9042.57", „9,645.41". */
const MONEY_WITH_DECIMALS_RE =
  /(?<![\d.,])(\d{1,3}(?:[  .]\d{3})+|\d{1,3}(?:,\d{3})+(?=\.)|\d+)[.,](\d{2})(?![\d])/g;

/** Toate sumele cu zecimale din text, în unități minore (cenți/bani). */
export function moneyTokensWithDecimals(rawText: string): number[] {
  const out: number[] = [];
  for (const m of rawText.matchAll(MONEY_WITH_DECIMALS_RE)) {
    const whole = Number(m[1].replace(/[  .,]/g, ""));
    if (Number.isSafeInteger(whole)) out.push(whole * 100 + Number(m[2]));
  }
  return out;
}

/**
 * Suma întreagă a modelului („1508") → suma cu bani din document („1508,51"), când documentul o
 * scrie într-un singur fel. Nu atinge nimic dacă documentul scrie și forma „,00" (atunci modelul a
 * citit bine) sau dacă există mai multe variante cu bani diferiți (nu ghicim care).
 */
export function restoreDroppedDecimals(amountMinor: number | null, rawText: string): number | null {
  if (amountMinor == null || amountMinor <= 0 || amountMinor % 100 !== 0 || !rawText) return amountMinor;
  const whole = amountMinor / 100;
  const variants = new Set(
    moneyTokensWithDecimals(rawText).filter((t) => Math.floor(t / 100) === whole),
  );
  if (variants.has(amountMinor)) return amountMinor;
  return variants.size === 1 ? [...variants][0] : amountMinor;
}

/** Algoritmul oficial al cifrei de control pentru IDNO/IDNP (13 cifre, ponderi 7-3-1). */
export function isValidMdFiscalCode(code: string | null | undefined): boolean {
  const digits = (code ?? "").replace(/\s/g, "");
  if (!/^\d{13}$/.test(digits)) return false;
  const weights = [7, 3, 1];
  const sum = [...digits.slice(0, 12)].reduce((acc, d, i) => acc + Number(d) * weights[i % 3], 0);
  return sum % 10 === Number(digits[12]);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Suma e de fapt un identificator de pe document? Adevărat când cifrele părții întregi sunt:
 *  - un cod fiscal de 13 cifre valid (IDNO/IDNP) sau codul/contul uneia dintre părți, ori
 *  - prezente în text DOAR lipite de alte litere/cifre (numărul facturii „EBK000758854", un IBAN),
 *    niciodată ca număr de sine stătător.
 * Sumele rotunde de pe document („70000,00", „23042") rămân sume — sunt scrise ca atare în text.
 */
export function amountLooksLikeIdentifier(
  amountMinor: number | null,
  rawText: string,
  partyIds: readonly (string | null | undefined)[] = [],
): boolean {
  if (amountMinor == null || amountMinor <= 0 || amountMinor % 100 !== 0 || !rawText) return false;
  const digits = String(amountMinor / 100);
  if (digits.length < 5) return false;
  const ids = partyIds.map((v) => (v ?? "").replace(/\s/g, "")).filter(Boolean);
  if (ids.some((id) => id === digits || id.endsWith(digits) && /[A-Z]/i.test(id))) return true;
  if (digits.length === 13 && isValidMdFiscalCode(digits)) return true;
  const d = escapeRe(digits);
  const standalone = new RegExp(`(?<![\\p{L}\\d])${d}(?![\\p{L}\\d])`, "u");
  if (standalone.test(rawText)) return false;
  const embedded = new RegExp(`[\\p{L}\\d]${d}|${d}[\\p{L}\\d]`, "u");
  return embedded.test(rawText);
}
