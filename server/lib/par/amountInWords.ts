/**
 * „Total factura în litere: douazeci si trei de mii patruzeci si doi lei 00 bani" → 2 304 200 cenți.
 *
 * De ce există: pe un cont de plată/factură din Moldova suma scrisă ÎN LITERE este cea care contează
 * legal, iar în textul extras dintr-un PDF ea e singurul loc unde totalul nu se poate rupe de
 * eticheta lui. Ordinea rândurilor dintr-un PDF e frecvent amestecată — pe contul de plată ZBOR.MD
 * nr. 68339 cifra „23042" a ajuns pe rândul 3, iar „TOTAL" pe rândul 5; modelul a citit de acolo
 * 23 442 lei (400 de lei în plus pe o cerere de plată reală), iar parserul determinist nu a găsit
 * nicio sumă. Suma în litere le repară pe amândouă, fără să depindă de model.
 *
 * Pur și determinist: fără I/O, fără rețea. Întoarce null când documentul nu are un „în litere"
 * lizibil — apelantul păstrează atunci suma extrasă normal.
 */

export type WordsCurrency = "MDL" | "EUR" | "USD";

export interface AmountInWords {
  /** Suma în cenți (unități minore), inclusiv banii. */
  cents: number;
  /** Valuta dedusă din cuvântul de final ("lei"/"euro"/"dolari"), dacă apare. */
  currency: WordsCurrency | null;
  /** Fraza brută găsită — utilă în mesajele de verificare. */
  phrase: string;
}

/** „ș/ț/ă/â/î" și variantele cu sedilă → ASCII, ca să scriem un singur dicționar. */
function foldDiacritics(s: string): string {
  return s
    .replace(/[ăâàáäã]/gi, "a")
    .replace(/[îíìï]/gi, "i")
    .replace(/[șşś]/gi, "s")
    .replace(/[țţ]/gi, "t")
    .replace(/[éèëê]/gi, "e")
    .replace(/[óòöô]/gi, "o")
    .replace(/[úùüû]/gi, "u");
}

const UNITS: Record<string, number> = {
  zero: 0,
  un: 1, unu: 1, una: 1, o: 1,
  doi: 2, doua: 2,
  trei: 3,
  patru: 4,
  cinci: 5,
  sase: 6,
  sapte: 7,
  opt: 8,
  noua: 9,
  zece: 10,
  unsprezece: 11,
  doisprezece: 12, douasprezece: 12,
  treisprezece: 13,
  paisprezece: 14, patrusprezece: 14,
  cincisprezece: 15,
  saisprezece: 16, sasesprezece: 16,
  saptesprezece: 17,
  optsprezece: 18,
  nouasprezece: 19,
  douazeci: 20,
  treizeci: 30,
  patruzeci: 40,
  cincizeci: 50,
  saizeci: 60, sasezeci: 60,
  saptezeci: 70,
  optzeci: 80,
  nouazeci: 90,
};


const HUNDREDS = new Set(["suta", "sute"]);
const THOUSANDS = new Set(["mie", "mii"]);
const MILLIONS = new Set(["milion", "milioane"]);
/** Cuvinte care nu poartă valoare: legături, „de", plus formele de plural ale valutei. */
const FILLERS = new Set(["si", "de", "a", "al", "ai", "ale", "cu", "virgula", "punct"]);

const CURRENCY_WORDS: Array<{ re: RegExp; currency: WordsCurrency }> = [
  { re: /^(?:lei|leu|mdl)$/, currency: "MDL" },
  { re: /^(?:euro|eur)$/, currency: "EUR" },
  { re: /^(?:dolari|dolar|usd)$/, currency: "USD" },
];

function currencyOf(token: string): WordsCurrency | null {
  for (const c of CURRENCY_WORDS) if (c.re.test(token)) return c.currency;
  return null;
}

/**
 * Convertește o secvență de cuvinte-număr în românește într-un întreg.
 * Întoarce null dacă secvența nu conține niciun cuvânt-număr.
 */
export function wordsToNumber(tokens: string[]): number | null {
  let total = 0;
  let current = 0;
  let sawNumber = false;

  for (const t of tokens) {
    if (FILLERS.has(t)) continue;
    if (t in UNITS) {
      current += UNITS[t];
      sawNumber = true;
      continue;
    }
    if (HUNDREDS.has(t)) {
      current = (current || 1) * 100;
      sawNumber = true;
      continue;
    }
    if (THOUSANDS.has(t)) {
      total += (current || 1) * 1000;
      current = 0;
      sawNumber = true;
      continue;
    }
    if (MILLIONS.has(t)) {
      total += (current || 1) * 1_000_000;
      current = 0;
      sawNumber = true;
      continue;
    }
    // Cifre scrise ca număr chiar în frază („douazeci si trei de mii 42 lei").
    if (/^\d{1,3}$/.test(t)) {
      current += Number(t);
      sawNumber = true;
      continue;
    }
    return sawNumber ? total + current : null; // cuvânt necunoscut → oprim citirea aici
  }
  return sawNumber ? total + current : null;
}

/** Eticheta care introduce suma în litere, în variantele întâlnite pe documentele MD/RU. */
const IN_WORDS_LABEL_RE =
  /(?:(?:în|in)\s+litere|прописью|словами)\s*[:\-–]?\s*([^\n]{3,220})/i;

/**
 * Caută „…în litere: <cuvinte> lei <bani>" în textul documentului și întoarce suma în cenți.
 * Nu aruncă niciodată; null înseamnă „documentul nu spune suma în litere (sau nu o pot citi sigur)".
 */
export function parseAmountInWords(rawText: string): AmountInWords | null {
  if (!rawText) return null;
  const m = IN_WORDS_LABEL_RE.exec(rawText);
  if (!m) return null;
  const phrase = m[1].trim();

  const folded = foldDiacritics(phrase).toLowerCase();
  const tokens = folded.split(/[^a-z0-9]+/).filter(Boolean);

  // Partea întreagă: până la cuvântul de valută (lei/euro/dolari).
  let currency: WordsCurrency | null = null;
  let cut = tokens.length;
  for (let i = 0; i < tokens.length; i++) {
    const c = currencyOf(tokens[i]);
    if (c) {
      currency = c;
      cut = i;
      break;
    }
  }
  const whole = wordsToNumber(tokens.slice(0, cut));
  if (whole == null || whole < 0) return null;

  // Bani: „00 bani" / „50 bani" / „cincizeci bani" — după cuvântul de valută.
  let bani = 0;
  const rest = tokens.slice(cut + 1);
  const baniIdx = rest.indexOf("bani");
  if (baniIdx > 0) {
    const parsed = wordsToNumber(rest.slice(0, baniIdx));
    if (parsed != null && parsed >= 0 && parsed < 100) bani = parsed;
  }

  const cents = whole * 100 + bani;
  if (cents <= 0) return null;
  return { cents, currency, phrase };
}
