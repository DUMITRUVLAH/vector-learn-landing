/**
 * DG-108 — suma în litere, în română, pentru actele oficiale.
 *
 * De ce nu se poate „aproxima": pe un act moldovenesc, suma scrisă în litere este cea care contează
 * în caz de litigiu, iar contabila o citește cuvânt cu cuvânt. Azi se scrie de mână, iar greșelile
 * de tipul „cinci sute lei" (corect: „cinci sute DE lei") sau „doi mii" (corect: „două mii") apar
 * exact pe actele care ajung la bancă.
 *
 * Regulile românești implementate:
 *  - „de" înaintea substantivului când ultimele două cifre sunt 0 sau între 20 și 99
 *    (24 500 → „douăzeci și patru de mii cinci sute DE lei"; 15 → „cincisprezece lei");
 *  - gen feminin pentru sute/mii: „două sute", „două mii", „o mie", „douăzeci și una de mii";
 *  - gen masculin pentru unități și milioane: „doi lei", „două milioane" (milion e neutru: „două").
 *
 * Perechea ei de citire (litere → cifre) trăiește în server/lib/par/amountInWords.ts.
 */

const UNITS_M = ["zero", "unu", "doi", "trei", "patru", "cinci", "șase", "șapte", "opt", "nouă"];
const UNITS_F = ["zero", "una", "două", "trei", "patru", "cinci", "șase", "șapte", "opt", "nouă"];
const TEENS_M = [
  "zece", "unsprezece", "doisprezece", "treisprezece", "paisprezece",
  "cincisprezece", "șaisprezece", "șaptesprezece", "optsprezece", "nouăsprezece",
];
const TEENS_F = [
  "zece", "unsprezece", "douăsprezece", "treisprezece", "paisprezece",
  "cincisprezece", "șaisprezece", "șaptesprezece", "optsprezece", "nouăsprezece",
];
const TENS = [
  "", "", "douăzeci", "treizeci", "patruzeci", "cincizeci",
  "șaizeci", "șaptezeci", "optzeci", "nouăzeci",
];

/** „de" se pune când ultimele două cifre sunt 0 sau 20–99. */
export function needsDe(n: number): boolean {
  const last2 = n % 100;
  return n >= 20 && (last2 === 0 || last2 >= 20);
}

/** 0–999, cu gen — sutele sunt mereu feminine („două sute"), restul după `feminine`. */
function under1000(n: number, feminine: boolean): string {
  if (n === 0) return "";
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;

  if (hundreds === 1) parts.push("o sută");
  else if (hundreds > 1) parts.push(`${UNITS_F[hundreds]} sute`);

  if (rest > 0) {
    if (rest < 10) parts.push(feminine ? UNITS_F[rest] : UNITS_M[rest]);
    else if (rest < 20) parts.push(feminine ? TEENS_F[rest - 10] : TEENS_M[rest - 10]);
    else {
      const tens = Math.floor(rest / 10);
      const unit = rest % 10;
      parts.push(
        unit === 0
          ? TENS[tens]
          : `${TENS[tens]} și ${feminine ? UNITS_F[unit] : UNITS_M[unit]}`
      );
    }
  }
  return parts.join(" ");
}

/** Numărul întreg în litere (fără substantiv). 0 → „zero". */
export function numberToWordsRo(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0) return "zero";

  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  if (millions > 0) {
    if (millions === 1) parts.push("un milion");
    else {
      const w = under1000(millions, true);
      parts.push(`${w}${needsDe(millions) ? " de" : ""} milioane`);
    }
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push("o mie");
    else {
      const w = under1000(thousands, true);
      parts.push(`${w}${needsDe(thousands) ? " de" : ""} mii`);
    }
  }
  if (rest > 0) parts.push(under1000(rest, false));

  return parts.join(" ");
}

export interface AmountWordsOptions {
  /** Substantivul la singular și plural: MDL → leu/lei, EUR → euro/euro. */
  currency?: string;
}

const CURRENCY_NOUNS: Record<string, { one: string; many: string; sub: string }> = {
  MDL: { one: "leu", many: "lei", sub: "bani" },
  EUR: { one: "euro", many: "euro", sub: "eurocenți" },
  USD: { one: "dolar", many: "dolari", sub: "cenți" },
  RON: { one: "leu", many: "lei", sub: "bani" },
};

/**
 * Suma din unități minore („cenți") în litere, cu subunitățile scrise cu cifre — forma folosită pe
 * actele din Moldova: „douăzeci și patru de mii cinci sute de lei 00 bani".
 */
export function amountToWordsRo(cents: number, opts: AmountWordsOptions = {}): string {
  const code = (opts.currency ?? "MDL").toUpperCase();
  const noun = CURRENCY_NOUNS[code] ?? { one: code, many: code, sub: "subunități" };
  const safe = Math.max(0, Math.round(cents));
  const whole = Math.floor(safe / 100);
  const sub = safe % 100;

  // „un leu", nu „unu leu" — dar „douăzeci și unu de lei" rămâne cum e, deci corectăm doar
  // numărul singur, nu terminația oricărui compus.
  const words = whole === 1 ? "un" : numberToWordsRo(whole);
  const de = needsDe(whole) ? "de " : "";
  const nounWord = whole === 1 ? noun.one : noun.many;

  return `${words} ${de}${nounWord} ${String(sub).padStart(2, "0")} ${noun.sub}`;
}
