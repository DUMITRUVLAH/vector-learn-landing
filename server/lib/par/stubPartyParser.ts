/**
 * PAR AI multi-party extraction — deterministic stub/CI parser.
 *
 * `parsePartiesFromText(docText)` turns a document's raw text into a
 * `ParPartiesExtraction` (parties + amount + currency + scope + class) using ONLY
 * regexes — no LLM, no network, no API key. It is the CI/test path AND the
 * LLM-failure fallback inside parExtractor.ts.
 *
 * Pure: same input → same output. The 20-scenario suite calls it directly.
 */

import type {
  ParExtractedParty,
  ParPartiesExtraction,
  ParRole,
} from "./parPartyTypes";
import { isPayeeBank, findBankKeywordMatch } from "./payeeBankClassifier";
import { splitBankRequisites } from "./bankRequisites";
import { purifyExtraction } from "./partyPurify";

// ─── Low-level token extractors (exported for unit tests) ─────────────────────

/**
 * Normalizează diacriticele românești LEGACY (cu sedilă) la forma corectă (cu virgulă).
 *
 * Multe documente din Moldova — inclusiv formularul tipizat de factură fiscală — sunt
 * generate cu fonturi vechi și ies din PDF cu `ş` (U+015F) și `ţ` (U+0163) în loc de
 * `ș` (U+0219) și `ț` (U+021B). Sunt caractere DIFERITE: orice regex scris cu forma
 * corectă nu se potrivește pe cea veche, în tăcere. Așa a scăpat antetul de tabel în
 * câmpul „Scop" chiar DUPĂ ce filtrul de antete exista — „poziţiei" nu se potrivea cu
 * `pozi[țt]iei` (owner, 2026-08-25 #3).
 *
 * Înlocuirea e 1:1 pe caracter, deci NU schimbă lungimile și nu invalidează niciunul
 * dintre offset-urile pe care se bazează asocierea rechizit→parte.
 */
export function normalizeRoDiacritics(text: string): string {
  return text
    .replace(/\u015F/g, "\u0219") // ş → ș
    .replace(/\u015E/g, "\u0218") // Ş → Ș
    .replace(/\u0163/g, "\u021B") // ţ → ț
    .replace(/\u0162/g, "\u021A"); // Ţ → Ț
}

/** Strip all whitespace, uppercase. */
export function stripIbanSpaces(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Collapse OCR-spaced digit groups: "2 0 0 3..." → "2003...". */
function collapseDigits(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/** Find MD + foreign IBAN candidates in text, returning {value, index} with raw spans collapsed. */
export function findIbanCandidates(text: string): Array<{ value: string; index: number }> {
  const out: Array<{ value: string; index: number }> = [];
  const seen = new Set<number>();
  // MD IBAN: MD + 2 digits + 20 alnum, possibly single-spaced groups.
  const mdRe = /\bMD\s?\d{2}(?:[ ]?[A-Z0-9]){20}\b/gi;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(text)) !== null) {
    out.push({ value: stripIbanSpaces(m[0]), index: m.index });
    seen.add(m.index);
  }
  // Foreign IBAN: 2 letters + 2 digits + 11..30 alnum (DE, etc.). Skip MD (already matched).
  const fRe = /\b([A-Z]{2})\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/g;
  while ((m = fRe.exec(text)) !== null) {
    if (m[1].toUpperCase() === "MD") continue;
    if (seen.has(m.index)) continue;
    out.push({ value: stripIbanSpaces(m[0]), index: m.index });
  }
  return out;
}

/** Find labelled 13-digit fiscal ids, returning {value, index}. */
export function findIdCandidates(text: string): Array<{ value: string; index: number }> {
  const out: Array<{ value: string; index: number }> = [];
  // Labelled: cod fiscal / IDNO / IDNP / ИДНО / fiscal code / Company Reg → 13 digits (maybe spaced).
  const labelled =
    /(?:cod\s*fiscal|IDNO|IDNP|ИДНО|фискальн\w*\s*код|fiscal\s*code|Company\s*Reg[^0-9]{0,20})[^0-9]{0,14}((?:\d[ ]?){13})/gi;
  let m: RegExpExecArray | null;
  while ((m = labelled.exec(text)) !== null) {
    const digits = collapseDigits(m[1]);
    if (digits.length === 13) out.push({ value: digits, index: m.index });
  }
  // Loose fallback: a standalone 13-digit run (possibly OCR-spaced).
  const loose = /\b((?:\d[ ]?){13})\b/g;
  while ((m = loose.exec(text)) !== null) {
    const digits = collapseDigits(m[1]);
    if (digits.length !== 13) continue;
    if (out.some((o) => o.value === digits && Math.abs(o.index - m!.index) < 60)) continue;
    out.push({ value: digits, index: m.index });
  }
  return out;
}

/** Find VAT codes (NEVER fiscal ids). */
export function findVatCandidates(text: string): Array<{ value: string; index: number }> {
  const out: Array<{ value: string; index: number }> = [];
  const re =
    /(?:Cod\s*TVA|Cod\s*IVA|VAT(?:\s*No\.?| ID| No)?|Код\s*НДС|USt-?IdNr\.?)[^0-9A-Z]{0,10}([A-Z]{0,2}\s?\d{4,12}[A-Z]?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ value: m[1].replace(/\s+/g, ""), index: m.index });
  }
  return out;
}

// ─── Amount + currency ────────────────────────────────────────────────────────

/** Parse a localized number (RO "45 000,00" / EN "48,750.00" / "5000") to a float of major units. */
export function parseLocalizedAmount(raw: string): number | null {
  let s = raw.trim().replace(/[^\d.,\s]/g, "").trim();
  if (!s) return null;
  // Remove thousands spaces.
  s = s.replace(/(?<=\d)\s+(?=\d)/g, "");
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // The rightmost separator is the decimal sep.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      // RO: dot=thousands, comma=decimal
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // EN: comma=thousands, dot=decimal
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Comma only: decimal if it has exactly 2 trailing digits, else thousands.
    if (/,\d{2}$/.test(s)) s = s.replace(/\.(?=)/g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else {
    // Dot only: decimal if exactly 2 trailing digits, else thousands.
    if (!/\.\d{2}$/.test(s)) s = s.replace(/\./g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

const CURRENCY_HINTS: Array<{ re: RegExp; cur: "MDL" | "EUR" | "USD" }> = [
  { re: /€|\bEUR\b/i, cur: "EUR" },
  { re: /\$|\bUSD\b/i, cur: "USD" },
  { re: /\blei\b|\blEI\b|\bлей\b|\bлеев\b|\bMDL\b/i, cur: "MDL" },
];

/** Priority-ordered PAY-TOTAL line anchors. */
const TOTAL_ANCHORS = [
  /Total\s*de\s*plat[ăa]/i,
  /TOTAL\s*DUE/i,
  /\bAmount\s*(?:due|to\s*pay)?\s*:/i,
  /Итого\s*к\s*оплате/i,
  /всего/i,
  /сумма\s*к\s*оплате/i,
  /Valoarea\s*total[ăa]/i,
  /Valoarea\s*contractului/i,
  /Стоимость\s*договора/i,
  /ИТОГО\s*к\s*оплате/i,
  /ИТОГО/i,
  /Remunera\w+/i,
  /remunerare/i,
  /în\s*m[ăa]rime\s*de/i,
  /стоимость/i,
  /Suma\s*de/i,
  /\bSuma\b/i,
  /\bСумма\b/i,
  /\bTOTAL\b/i,
  /preț/i,
];

interface AmountResult {
  amountCents: number | null;
  currency: "MDL" | "EUR" | "USD" | null;
}

function detectCurrencyNear(snippet: string): "MDL" | "EUR" | "USD" | null {
  for (const h of CURRENCY_HINTS) if (h.re.test(snippet)) return h.cur;
  return null;
}

/**
 * A money-shaped number, in either printed order:
 *   group 1 — currency BEFORE the number ("MDL 8,000.00", "EUR 1 200")
 *   group 2 — currency (or a bracket) AFTER it ("8 000,00 lei", "45000.00)")
 * Avoids matching list prefixes ("3.1."), dates, article numbers, percentages.
 */
/** Grouped ("8 000,00", "8,000.00") or plainly decimal ("450.00") — unmistakably money. */
const MONEY_STRONG = String.raw`\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2}`;
/** A bare digit run ("8000") — only money when a currency or bracket sits right next to it,
 * otherwise it is a fiscal code, a document number or a year. */
const MONEY_LOOSE = String.raw`\d{3,}`;
const CURRENCY_AFTER = String.raw`lei|лей|леев|MDL|€|EUR|\$|USD`;

const MONEY_NUM_RE = new RegExp(
  // currency printed BEFORE the number: "MDL 8,000.00 (opt mii lei)"
  String.raw`\b(?:MDL|EUR|USD|LEI)\s*(${MONEY_STRONG}|${MONEY_LOOSE})` +
    // …or after it, incl. at end of line: "Preț total (inclusiv TVA) 8,000.00"
    String.raw`|(${MONEY_STRONG})\s*(?:${CURRENCY_AFTER}|[)(]|\n|$)` +
    // …a bare run needs an explicit currency/bracket next to it to count as money at all
    String.raw`|(${MONEY_LOOSE})\s*(?:${CURRENCY_AFTER}|[)(])`,
  "gi",
);

/**
 * Find the first genuine money amount in `window`.
 *
 * Digits that are part of a longer alphanumeric token are NEVER money: an IBAN
 * ("MD80VI000002224217675MDL") ends in a currency code, so without this guard it reads as
 * "2 224 217 675,00 MDL" — which is exactly what the owner's contract prefilled before this
 * check existed (a 2.2-billion-lei request instead of 8 000 lei).
 */
function findMoneyInWindow(window: string): number | null {
  MONEY_NUM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MONEY_NUM_RE.exec(window)) !== null) {
    const raw = m[1] ?? m[2] ?? m[3];
    if (!raw) continue;
    const numIndex = m.index + m[0].indexOf(raw);
    if (/[A-Za-z]/.test(window[numIndex - 1] ?? "")) continue; // inside an IBAN / code token
    const major = parseLocalizedAmount(raw);
    if (major != null && major > 0) return major;
  }
  // Tier 2 — COLUMN TABLES: the typized MD fiscal invoice (Anexa 1, Ordin MF 118/2017) prints
  // "12. TOTAL … 17000,00 X 0,00 17000,00 X X X" — the total is followed by neighbouring COLUMNS,
  // never by a currency word, so every tier-1 alternative misses it and the amount stayed null on
  // the country's most common document (owner report 2026-08-25). Accept a number that is
  // unmistakably money BY SHAPE (thousands grouping or exactly 2 decimals — never a list index
  // "3.1", a year, or a bare count), keeping the same "not inside an alphanumeric token" guard
  // so an IBAN can still never be read as an amount.
  const shapeRe = /(\d{1,3}(?:[ .]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2})(?![\d.,])/g;
  let sm: RegExpExecArray | null;
  while ((sm = shapeRe.exec(window)) !== null) {
    if (/[A-Za-z]/.test(window[sm.index - 1] ?? "")) continue; // inside an IBAN / code token
    const major = parseLocalizedAmount(sm[1]);
    if (major != null && major > 0) return major;
  }
  return null;
}

/** Extract the pay-total amount + currency by scanning anchor lines in priority order. */
export function extractAmount(text: string): AmountResult {
  const lines = text.split(/\r?\n/);
  for (const anchor of TOTAL_ANCHORS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const am = anchor.exec(line);
      if (!am) continue;
      // Search for a money-shaped number AFTER the anchor on this line, then the next line.
      const afterAnchor = line.slice(am.index + am[0].length);
      // Collapse OCR spaces around the decimal separator: "12 340 ,00" → "12 340,00".
      const window = `${afterAnchor}\n${lines[i + 1] ?? ""}`.replace(/(\d)\s+([.,]\d{2}\b)/g, "$1$2");
      const major = findMoneyInWindow(window);
      if (major == null) continue;
      const cur = detectCurrencyNear(window) ?? detectCurrencyNear(line) ?? detectCurrencyNear(text) ?? "MDL";
      return { amountCents: Math.round(major * 100), currency: cur };
    }
  }
  return { amountCents: null, currency: detectCurrencyNear(text) };
}

// ─── Role anchors ─────────────────────────────────────────────────────────────

interface RoleAnchorDef {
  re: RegExp;
  role: ParRole;
  payerHint?: boolean;
}

// Order matters: more specific / paid-role anchors should be discoverable; the
// block segmentation uses the position of each anchor occurrence.
const ROLE_ANCHORS: RoleAnchorDef[] = [
  { re: /\bExecutor\b/i, role: "executor" },
  { re: /\bPrestator\b/i, role: "provider" },
  { re: /\bИсполнитель\b/i, role: "provider" },
  { re: /\bПоставщик\b/i, role: "provider" },
  { re: /\bПодрядчик\b/i, role: "provider" },
  { re: /\bСубподрядчик\b/i, role: "provider" },
  { re: /\bFurnizor\b/i, role: "provider" },
  { re: /\bV[âa]nz[ăa]tor\b/i, role: "provider" },
  { re: /\bAntreprenor(?:\s*General)?\b/i, role: "provider" },
  { re: /\bSubantreprenor\b/i, role: "provider" },
  { re: /\bSupplier\b/i, role: "provider" },
  { re: /\bSeller\b/i, role: "provider" },
  { re: /\bContractor\b/i, role: "provider" },
  { re: /\bBill\s*From\b/i, role: "provider" },
  { re: /\bПодрядчик\b/i, role: "provider" },
  { re: /\bСубподрядчик\b/i, role: "provider" },
  { re: /\bПолучател\w*\s*платеж\w*/i, role: "provider" },
  { re: /Получатель\b/i, role: "provider" },
  // "Beneficiar plată" / "Beneficiar al plății" / "Beneficiarul plății" = the PAYEE (who receives),
  // NOT the client — overrides the bare "Beneficiar" client anchor by being matched first.
  { re: /Beneficiar(?:ul)?\s*(?:pl[ăa]t[ăaii]|al\s*pl[ăa][țt]ii)/i, role: "provider" },
  { re: /\bПлательщик\b/i, role: "client", payerHint: true },
  { re: /\bЗаказчик\b/i, role: "client", payerHint: true },
  { re: /\bPl[ăa]titor\b/i, role: "client", payerHint: true },
  { re: /\bOrdonator\b/i, role: "client", payerHint: true },
  { re: /\bBill\s*To\b/i, role: "client", payerHint: true },
  { re: /\bCump[ăa]r[ăa]tor\b/i, role: "client" },
  { re: /\bBeneficiar\b/i, role: "client" },
  { re: /\bBuyer\b/i, role: "client" },
  { re: /\bClient\b/i, role: "client" },
];

interface AnchorHit {
  index: number;
  role: ParRole;
  payerHint: boolean;
}

function findRoleAnchors(text: string): AnchorHit[] {
  const hits: AnchorHit[] = [];
  for (const def of ROLE_ANCHORS) {
    const re = new RegExp(def.re.source, def.re.flags.includes("g") ? def.re.flags : def.re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      hits.push({ index: m.index, role: def.role, payerHint: !!def.payerHint });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  // Dedupe near-identical hits at the same index (keep first/most-specific).
  const deduped: AnchorHit[] = [];
  for (const h of hits) {
    if (deduped.some((d) => Math.abs(d.index - h.index) < 2)) continue;
    deduped.push(h);
  }
  return deduped;
}

/**
 * Role words as they appear INSIDE a binding phrase or a signature-column header, mapped to the
 * role they assign. Separate from ROLE_ANCHORS (which is proximity-based) because these two rules
 * are positional and authoritative, not "nearest wins".
 */
const ROLE_WORDS: Array<{ re: RegExp; role: ParRole; payerHint: boolean }> = [
  { re: /^executor/i, role: "executor", payerHint: false },
  {
    re: /^(?:prestator|furnizor|v[âa]nz[ăa]tor|antreprenor|subantreprenor|contractor|supplier|seller|исполнитель|поставщик|подрядчик)/i,
    role: "provider",
    payerHint: false,
  },
  // "Beneficiar" in an MD contract is the party that PAYS — but it is deliberately not marked
  // isPayerHint: that flag drops a party from the payee pool entirely, and when the tenant's own
  // org is the provider the Beneficiar is exactly who they raise the request against.
  { re: /^(?:beneficiar|client|cump[ăa]r[ăa]tor|buyer|заказчик|покупатель)/i, role: "client", payerHint: false },
  { re: /^(?:pl[ăa]titor|ordonator|плательщик)/i, role: "client", payerHint: true },
];

function roleForWord(word: string): { role: ParRole; payerHint: boolean } | null {
  for (const w of ROLE_WORDS) if (w.re.test(word)) return { role: w.role, payerHint: w.payerHint };
  return null;
}

/** A signature-block column header: a whole line that is nothing but two DIFFERENT role words
 * ("BENEFICIAR   PRESTATOR", "EXECUTOR BENEFICIAR"). */
const COLUMN_HEADER_RE =
  /^\s*(EXECUTOR|PRESTATOR|FURNIZOR|ANTREPRENOR|BENEFICIAR|CLIENT|CUMP[ĂA]R[ĂA]TOR|PL[ĂA]TITOR|ORDONATOR)\s+(EXECUTOR|PRESTATOR|FURNIZOR|ANTREPRENOR|BENEFICIAR|CLIENT|CUMP[ĂA]R[ĂA]TOR|PL[ĂA]TITOR|ORDONATOR)\s*:?\s*$/i;

/**
 * Positional role assignment — two rules that beat nearest-anchor proximity, because both state
 * the role EXPLICITLY rather than by adjacency:
 *
 *  A. "…denumită în continuare „Beneficiar”" / "…numit în continuare „Prestator”" binds the role
 *     to the party named just before it. This is the canonical MD-contract phrasing.
 *  B. A two-column signature header ("BENEFICIAR   PRESTATOR") assigns its roles to the next two
 *     party names IN ORDER (left column first). Proximity gets this exactly backwards: both
 *     header words sit on the same line, so the first party's nearest anchor is whichever word
 *     happens to be closer — which is how the owner's contract came out with the payer (CRJM)
 *     labelled `provider` and the payee (Vector Academy) labelled `client`.
 *
 * Returns a map keyed by the name-hit index, so the caller can lock those roles.
 */
function bindRolesPositionally(
  text: string,
  nameHits: NameHit[],
): Map<number, { role: ParRole; payerHint: boolean }> {
  const bound = new Map<number, { role: ParRole; payerHint: boolean }>();
  /** Parties bound by rule A. Rule B must not contradict them at a later occurrence: the
   * contract's own wording outranks the column order of a signature block. */
  const boundByPhrase = new Set<string>();

  // Rule A — "denumit(ă)/numit(ă) în continuare «ROLE»" refers back to the nearest preceding name.
  const bindRe =
    /(?:denumit|numit|referit)\w*\s+(?:în|in)\s+continuare\s*[„"“«]?\s*([\p{L}]+)/giu;
  let m: RegExpExecArray | null;
  while ((m = bindRe.exec(text)) !== null) {
    const r = roleForWord(m[1]);
    if (!r) continue;
    let best: NameHit | null = null;
    for (const h of nameHits) {
      if (h.index >= m.index) break;
      if (m.index - h.index > 400) continue;
      best = h; // nameHits are sorted, so the last one before the phrase is the nearest
    }
    if (best && !bound.has(best.index)) {
      bound.set(best.index, r);
      boundByPhrase.add(partyKey(best.name));
    }
  }

  // Rule B — two-column signature header assigns roles to the next two distinct names in order.
  let offset = 0;
  for (const line of text.split(/\r?\n/)) {
    const lineStart = offset;
    offset += line.length + 1;
    const hm = line.match(COLUMN_HEADER_RE);
    if (!hm) continue;
    const first = roleForWord(hm[1]);
    const second = roleForWord(hm[2]);
    if (!first || !second || first.role === second.role) continue;
    const seen = new Set<string>();
    const following: NameHit[] = [];
    for (const h of nameHits) {
      if (h.index < lineStart) continue;
      const k = h.name.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      following.push(h);
      if (following.length === 2) break;
    }
    for (const [i, r] of [first, second].entries()) {
      const hit = following[i];
      if (following.length !== 2 || bound.has(hit.index) || boundByPhrase.has(partyKey(hit.name))) continue;
      bound.set(hit.index, r);
    }
  }

  return bound;
}

// ─── Name extraction ──────────────────────────────────────────────────────────

const HONORIFICS_RE = /(?:^|\s)(?:dl\.|dna\.?|dnul|d-l|d-na|domnul|doamna|г-н|г-жа|cet[ăa][țt]ean(?:ul)?\s+al\s+Republicii\s+Moldova)(?=\s|$)/gi;

/** Clean a captured legal name: strip surrounding quotes, honorifics, trailing parentheticals. */
export function cleanName(raw: string): string {
  let s = raw.trim();
  // Normalize the spelled-out "Întreprinderea Individuală" to its "Î.I." abbreviation so the name
  // stays short AND the juridic detector still sees the legal form.
  s = s.replace(/Întreprinderea\s+Individual[ăa]|Intreprinderea\s+Individuala/gi, "Î.I.").trim();
  s = s.replace(HONORIFICS_RE, "").trim();
  // Strip trailing parenthetical qualifiers like "(rezident Moldova IT Park)" / "(Prestator)".
  s = s.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  // Remove ALL quote characters (legal names carry no meaningful internal quotes).
  s = s.replace(/["“”„«»]/g, " ");
  // Strip leading label/punctuation noise.
  s = s.replace(/^[,;:\-–\s]+/, "").trim();
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// Legal-form tokens that confirm a company name (used to validate non-quoted lines).
const LEGAL_FORM_RE =
  /\b(S\.?R\.?L\.?|S\.?A\.?|A\.?O\.?|Î\.?I\.?|ÎI|ООО|ОАО|ЗАО|GmbH|LLC|Ltd|SC|Fundați?a|Fundatia|Asociați?a\s+Obșteasc[ăa]|Asociatia\s+Obsteasca|Общественная\s+организация|Public\s+Assoc\w*|Întreprinderea\s+Individual[ăa]|Intreprinderea\s+Individuala)\b/i;

/** A discovered name occurrence in the document, with its character offset. */
interface NameHit {
  name: string;
  index: number;
}

/**
 * Identity key for merging the SAME company's several mentions. Legal-form tokens and punctuation
 * are printed inconsistently across a single document — the intro says `„Vector Academy" S.R.L`
 * and the signature block says `S.C. „Vector Academy" S.R.L.` — which split one party into two
 * half-filled entries (one with the IDNO, the other with the IBAN + bank + address) and offered
 * both to the user as separate payees.
 */
function partyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/["“”„«».,]/g, " ")
    .replace(/\b(?:s\s?c|s\s?r\s?l|s\s?a|a\s?o|î\s?i|i\s?i|ооо|оао|зао|gmbh|llc|ltd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find all party-name occurrences in the text (companies + persons), each with its offset.
 * Discovery order doesn't matter — callers sort by index.
 */
function findNameHits(text: string): NameHit[] {
  const hits: NameHit[] = [];
  const push = (name: string | null, index: number) => {
    if (!name) return;
    const c = cleanName(name);
    if (!c || c.length < 3) return;
    if (isPayeeBank(c)) return;
    hits.push({ name: c, index });
  };

  // 1. Quoted legal names, with optional legal-form prefix and/or suffix.
  //    SC "Ducont Audit" SRL  |  "Vector Academy" SRL  |  ООО «Клинсервис Про»  |  Î.I. "Andronic Construct"
  const quotedRe =
    /((?:Întreprinderea\s+Individual[ăa]\s+|Intreprinderea\s+Individuala\s+|SC\s+|ООО\s+|ОАО\s+|ЗАО\s+|S\.?R\.?L\.?\s+|S\.?A\.?\s+|A\.?O\.?\s+|Î\.?\s?I\.?\s+|ÎI\s+)?["“„«][^"“”„«»\n]{1,80}["”»](?:\s+(?:S\.?R\.?L\.?|S\.?A\.?|A\.?O\.?|SRL|SA))?)/g;
  let m: RegExpExecArray | null;
  while ((m = quotedRe.exec(text)) !== null) {
    const raw = m[1];
    // Reject bank lines ("BC «...» S.A." where the inner name is a known bank, or a "Banca:" line).
    const lineOf = (text.slice(0, m.index).split(/\r?\n/).pop() ?? "") + raw;
    if (/^\s*(?:Banca|Банк|Bank)\b/i.test(lineOf)) continue;
    // Reject scope/subject text quoted after "проект"/"проекту"/"Основание"/"obiectul" (e.g.
    // «Ремонт учебного центра») — that's the object of the contract, not a party.
    const before = text.slice(Math.max(0, m.index - 50), m.index);
    if (/проект\w*|основани\w*|obiectul|предмет|проекту/i.test(before) && !LEGAL_FORM_RE.test(raw)) continue;
    // Reject the contract's own defined terms in quotes — "…denumită în continuare „Beneficiar”"
    // names a ROLE, not a company, yet it was being extracted as a party called "Beneficiar" (and
    // one called "Prestator"), which then showed up as pickable payees with no requisites at all.
    const hasLegalForm = LEGAL_FORM_RE.test(raw);
    if (!hasLegalForm && /(?:denumit|numit|referit)\w*\s+(?:în|in)\s+continuare\s*$/i.test(before)) continue;
    // Reject single-word defined-term labels in quotes ("Clientul", "Antreprenorul", «наш фонд»)
    // that carry NO legal form and aren't multi-word company names.
    const inner = raw.replace(/^[^"“„«]*["“„«]/, "").replace(/["”»].*$/, "").trim();
    const innerWords = inner.split(/\s+/).filter(Boolean);
    const isDefinedTerm =
      innerWords.length === 1 &&
      !hasLegalForm &&
      /^(Client|Antreprenor|Subantreprenor|Prestator|Executor|Beneficiar|Furnizor|Cump[ăa]r[ăa]tor|Pl[ăa]titor)(?:ul)?$/i.test(
        inner,
      );
    if (isDefinedTerm) continue;
    // Reject a quoted SERVICE/PRODUCT title on a table row (qty+price on the same line, no
    // legal form) — «Servicii predare curs "Productie si editare video" serv 1 17000.00» must
    // not mint a phantom party out of the course name.
    const lineTail = text.slice(m.index + raw.length).split(/\r?\n/)[0] ?? "";
    if (!hasLegalForm && /\d+[.,]\d{2}/.test(lineOf.replace(raw, "") + lineTail)) continue;
    push(raw, m.index);
  }

  // 2. Honorific + person name: "dl. Vasile Cojocaru", "dna Tatiana Mocanu".
  //    Skip company REPRESENTATIVES ("reprezentată de ... dl. X", "în baza ...") — only count
  //    honorific persons that are themselves a party (Prestator/Beneficiar/etc.).
  const honorRe =
    /(?:dl\.|dna\.?|dnul|doamna|domnul)\s+([A-ZĂÂÎȘȚ][a-zăâîșț]+(?:\s+[A-ZĂÂÎȘȚ][a-zăâîșț]+){1,2})/g;
  while ((m = honorRe.exec(text)) !== null) {
    // Look only at the immediate ~40 chars on the SAME line before the honorific.
    const lineBefore = text.slice(Math.max(0, m.index - 40), m.index);
    const sameLine = lineBefore.split(/\r?\n/).pop() ?? "";
    if (/reprezentat\w*|administrator\w*|director\w*|în\s+lice|в\s+лице|reprezentant/i.test(sameLine)) continue;
    push(m[1], m.index);
  }

  // 3. Non-quoted company lines carrying a legal form: "SC LINGVO-PLUS SRL", "LinguaTech Solutions GmbH".
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1;
    if (!LEGAL_FORM_RE.test(line)) continue;
    if (/["“„«]/.test(line)) continue; // quoted lines already handled
    if (isPayeeBank(line)) continue;
    // Skip bank / requisite lines ("Banca: ...", "Банк: ...", "Bank: ...").
    if (/^\s*(?:Banca|Банк|Bank|Beneficiary\s*bank|Banca\s*benef)/i.test(line)) continue;
    // Strip a leading label ("FURNIZOR:", "Поставщик:", "(2) ANTREPRENOR GENERAL / Подрядчик:").
    let body = line.replace(/^[^:]{0,60}:\s*/, "").trim();
    // Trim trailing ", IDNO ..." / ", cod fiscal ..." / address tails.
    body = body.replace(/,\s*(IDNO|cod\s*fiscal|Cod\s*fiscal|IDNP|ИДНО)\b.*$/i, "").trim();
    const name = cleanName(body);
    if (name && LEGAL_FORM_RE.test(name) && !isPayeeBank(name)) {
      push(name, lineStart);
    }
  }

  // 3b. Role-labelled org name WITHOUT a legal form: "Prestator: Centrul de Resurse
  //     Juridice", "Заказчик: Фонд Открытых Инициатив". NGOs/institutions carry no SRL/SA,
  //     so the quoted and legal-form paths never see them. Colon required; the value must
  //     start uppercase and have ≥2 words (a single word after "Prestator:" is usually a
  //     defined term, and person names are path 4's job — dedupe merges overlaps).
  const labelledOrgRe =
    /(?:Prestator(?:ul)?|Executor(?:ul)?|Furnizor(?:ul)?|V[âa]nz[ăa]tor(?:ul)?|Antreprenor(?:ul)?|Beneficiar(?:ul)?|Cump[ăa]r[ăa]tor(?:ul)?|Client(?:ul)?|Achizitor(?:ul)?|Исполнитель|Заказчик|Поставщик|Подрядчик|Supplier|Contractor|Provider|Buyer)\s*:\s*([A-ZĂÂÎȘȚА-ЯЁ][^\n,;]{2,79})/g;
  while ((m = labelledOrgRe.exec(text)) !== null) {
    const val = m[1].trim();
    // ≥2 words, no digit runs (a value like "MD80VI…" or "1010620008129" is a requisite,
    // not a name), not a bank line.
    if (val.split(/\s+/).length < 2) continue;
    if (/\d{4,}/.test(val)) continue;
    if (isPayeeBank(val)) continue;
    push(val, m.index);
  }

  // 4. Person-like "Prenume Nume" runs (latin or cyrillic), e.g. "Gheorghe Rusu".
  //    Only after a "Primit de:" / "Prestator:" style label to avoid grabbing director names.
  const personLabelRe =
    /(?:Primit\s*de|Prestator(?:ul)?|Получатель|Получает|Name,?\s*Surname|Nume,?\s*Prenume|Prenume,?\s*Nume|Payee|Beneficiar(?:ul)?\s*pl[ăa][țt]ii)\s*[:\-]?\s*([A-ZĂÂÎȘȚА-ЯЁ][a-zăâîșțа-яё]+(?:\s+[A-ZĂÂÎȘȚА-ЯЁ][a-zăâîșțа-яё]+){1,2})/g;
  while ((m = personLabelRe.exec(text)) !== null) {
    push(m[1], m.index);
  }

  return hits;
}

// ─── document_class ───────────────────────────────────────────────────────────

function classify(
  text: string,
  hasAmount: boolean,
  hasIban: boolean,
): "invoice" | "receipt" | "not_invoice" {
  const meetingDoc = /ПРОТОКОЛ|proces-verbal|заседани|повестка\s*дня|protocol\s+nr/i.test(text);
  if (!hasAmount && !hasIban && meetingDoc) return "not_invoice";
  if (/Chitan[țt][ăa]|БОН|\breceipt\b|BON\s*DE\s*PLAT[ĂA]/i.test(text) && !hasIban) return "receipt";
  if (!hasAmount && !hasIban && !/factur|invoice|contract|ordin\s*de\s*plat|плат[её]жное/i.test(text))
    return "not_invoice";
  return "invoice";
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/** Determine a party's role from the nearest role anchor preceding its name. */
function roleForName(
  nameIndex: number,
  anchors: AnchorHit[],
): { role: ParRole; payerHint: boolean } {
  // Pick the closest anchor by absolute distance. An anchor BEFORE the name (a label like
  // "FURNIZOR:") can sit up to ~250 chars away; an anchor AFTER (a "denumită în continuare
  // BENEFICIAR" tail) up to ~120 chars. Closest wins.
  let best: AnchorHit | null = null;
  let bestScore = Infinity;
  for (const a of anchors) {
    const dist = nameIndex - a.index;
    let score: number;
    if (dist >= 0) {
      if (dist > 250) continue;
      score = dist;
    } else {
      if (-dist > 120) continue;
      score = -dist;
    }
    if (score < bestScore) {
      best = a;
      bestScore = score;
    }
  }
  if (best) return { role: best.role, payerHint: best.payerHint };
  return { role: "unknown", payerHint: false };
}

const COMPANY_SUFFIX = "(?:S\\.?\\s?R\\.?\\s?L\\.?|S\\.?\\s?A\\.?|Î\\.\\s?I\\.|I\\.I\\.|SRL|SA|PFA|GȚ)";

/** Find a "Name1 SRL  Name2 SRL" row (the EXECUTOR | BENEFICIAR names line of a 2-column table). */
function findTwoCompanyNames(text: string): [string, string] | null {
  const re = new RegExp(`^\\s*([\\p{L}][\\p{L}0-9 .,&"'„”«»-]{1,58}?${COMPANY_SUFFIX})\\.?\\s+([\\p{L}][\\p{L}0-9 .,&"'„”«»-]{1,58}?${COMPANY_SUFFIX})\\.?\\s*$`, "iu");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    const n1 = m[1].trim().replace(/[„"”]/g, "");
    const n2 = m[2].trim().replace(/[„"”]/g, "");
    if (/^(EXECUTOR|CLIENT|BENEFICIAR|FURNIZOR)/i.test(n1) || /^(EXECUTOR|CLIENT|BENEFICIAR|FURNIZOR)/i.test(n2)) continue;
    return [n1, n2];
  }
  return null;
}

/**
 * Detect a 2-column EXECUTOR | BENEFICIAR (left | right) requisites table — the standard MD-contract
 * layout. When the PDF is flattened to text, each requisite label repeats on its line:
 *   "Cod fiscal <left> Cod fiscal <right>" · "IBAN <left> IBAN <right>" · "Banca <left> Banca <right>"
 * The per-name windowing can't split these (it merges both columns / both names), so rebuild the two
 * parties cleanly: left column = EXECUTOR (the service provider = payee), right = CLIENT (the payer).
 * Returns null when no such table is present (≥2 columnar rows required) so normal parsing continues.
 */
function tryParseColumnarContract(text: string): ParExtractedParty[] | null {
  const labels: Array<{ key: "idno" | "iban" | "bank"; src: string }> = [
    { key: "idno", src: "Cod\\s*fiscal|IDNO|IDNP" },
    { key: "iban", src: "IBAN" },
    { key: "bank", src: "Banca|Bank" },
  ];
  const left: Record<string, string> = {};
  const right: Record<string, string> = {};
  let rows = 0;
  for (const line of text.split(/\r?\n/)) {
    for (const { key, src } of labels) {
      if (key in left) continue;
      const ms = [...line.matchAll(new RegExp(`(?:${src})`, "gi"))];
      if (ms.length !== 2) continue;
      const a = line.slice((ms[0].index ?? 0) + ms[0][0].length, ms[1].index).replace(/^[\s:.\-]+/, "").trim();
      const b = line.slice((ms[1].index ?? 0) + ms[1][0].length).replace(/^[\s:.\-]+/, "").trim();
      if (a && b) { left[key] = a; right[key] = b; rows++; }
    }
  }
  if (rows < 2) return null; // need ≥2 columnar requisite rows to be confident it's a 2-column table
  const names = findTwoCompanyNames(text);
  if (!names) return null;

  const mk = (name: string, v: Record<string, string>, role: ParRole, payerHint: boolean): ParExtractedParty => {
    const idnoDigits = (v.idno ?? "").replace(/\D/g, "");
    const ibanClean = v.iban ? stripIbanSpaces(v.iban) : "";
    let bank: string | null = null;
    if (v.bank) {
      // value may carry trailing noise from the next cell; take up to the first bank-name token run.
      const cand = v.bank.split(/\s{2,}/)[0].trim();
      bank = isPayeeBank(cand) ? cleanBankName(cand) : cand || null;
    }
    return {
      name: cleanName(name),
      role,
      idno: /^\d{13}$/.test(idnoDigits) ? idnoDigits : null,
      iban: /^MD[0-9A-Z]{22}$/.test(ibanClean) ? ibanClean : null,
      bank,
      vatCode: null,
      isPayerHint: payerHint,
    };
  };
  // Convention in MD contracts: the LEFT column is the EXECUTOR (provider = who is paid).
  return [mk(names[0], left, "executor", false), mk(names[1], right, "client", true)];
}

/**
 * Turn a document's raw text into a structured multi-party extraction.
 * Deterministic & pure.
 */
export function parsePartiesFromText(docText: string): Omit<ParPartiesExtraction, "isStub"> {
  // Length-preserving, so every offset below stays valid (see normalizeRoDiacritics).
  const text = normalizeRoDiacritics(docText ?? "");

  const ibans = findIbanCandidates(text);
  const ids = findIdCandidates(text);
  const vats = findVatCandidates(text);
  const { amountCents, currency } = extractAmount(text);
  const anchors = findRoleAnchors(text);

  // Discover party names, sorted by position; dedupe by normalized name (keep first occurrence,
  // which is usually the labelled header, then merge requisites from later occurrences).
  const nameHits = findNameHits(text).sort((a, b) => a.index - b.index);
  const boundRoles = bindRolesPositionally(text, nameHits);

  // Build, per distinct name, the role + windowed requisites.
  type WorkingParty = ParExtractedParty & { _roleLocked?: boolean };
  const partyMap = new Map<string, WorkingParty>();
  const usedIban = new Set<number>();
  const usedId = new Set<number>();
  const subAmountByParty = new Map<string, number>();

  for (const hit of nameHits) {
    const key = partyKey(hit.name);
    const bound = boundRoles.get(hit.index);
    const { role, payerHint } = bound ?? roleForName(hit.index, anchors);

    // Requisite window: from this name to the next name occurrence (or +400 chars).
    const nextIdx = nameHits
      .map((h) => h.index)
      .filter((i) => i > hit.index)
      .sort((a, b) => a - b)[0];
    const winStart = hit.index;
    const winEnd = Math.min(nextIdx ?? text.length, hit.index + 400);
    const block = text.slice(winStart, winEnd);

    const blockIban = ibans.find(
      (ib) => ib.index >= winStart && ib.index < winEnd && !usedIban.has(ib.index),
    );
    const blockId = ids.find(
      (id) => id.index >= winStart && id.index < winEnd && !usedId.has(id.index),
    );
    const blockVat = vats.find((v) => v.index >= winStart && v.index < winEnd);
    const bankLine = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => isPayeeBank(l));
    const bankReq = bankLine ? cleanBankRequisites(bankLine) : null;
    const bank = bankReq?.bank ?? null;
    const bic = extractBicSnippet(block) ?? bankReq?.bic ?? null;
    const legalAddress = extractAddressSnippet(block) ?? extractNameLineAddress(text, hit.index);
    const administratorName = extractAdministratorSnippet(block);
    const subAmt = extractSubAmount(block);

    const existing = partyMap.get(key);
    if (existing) {
      // Merge requisites from a later occurrence (e.g. the "rechizite" block).
      if (!existing.idno && blockId) {
        existing.idno = blockId.value;
        usedId.add(blockId.index);
      }
      if (!existing.iban && blockIban) {
        existing.iban = blockIban.value;
        usedIban.add(blockIban.index);
      }
      if (!existing.bank && bank) existing.bank = bank;
      if (!existing.bic && bic) existing.bic = bic;
      if (!existing.legalAddress && legalAddress) existing.legalAddress = legalAddress;
      if (!existing.administratorName && administratorName) existing.administratorName = administratorName;
      if (!existing.vatCode && blockVat) existing.vatCode = blockVat.value;
      // An explicitly BOUND role (a "denumit în continuare …" phrase or a signature-column header)
      // always wins over whatever proximity guessed at another occurrence.
      if (bound) {
        existing.role = bound.role;
        existing.isPayerHint = bound.payerHint;
        existing._roleLocked = true;
      } else if (
        // Prefer a paid role if a later anchor disambiguates it (e.g. rechizite under "EXECUTOR").
        (existing.role === "unknown" || existing.role === "client") &&
        (role === "executor" || role === "provider") &&
        !existing._roleLocked
      ) {
        existing.role = role;
        existing.isPayerHint = payerHint;
      }
      if (subAmt != null && !subAmountByParty.has(key)) subAmountByParty.set(key, subAmt);
      continue;
    }

    if (blockId) usedId.add(blockId.index);
    if (blockIban) usedIban.add(blockIban.index);
    if (subAmt != null) subAmountByParty.set(key, subAmt);

    const party: WorkingParty = {
      name: hit.name,
      role,
      idno: blockId?.value ?? null,
      iban: blockIban?.value ?? null,
      bank,
      bic,
      legalAddress,
      administratorName,
      vatCode: blockVat?.value ?? null,
      isPayerHint: payerHint,
      // Lock an explicitly bound role, or a confidently-labelled one (a real anchor right
      // before the name).
      _roleLocked: bound != null || role !== "unknown",
    };
    partyMap.set(key, party);
  }

  let workingParties = [...partyMap.values()];

  // 2-column EXECUTOR | BENEFICIAR requisites table (standard MD contract): rebuild the two parties
  // cleanly from the columns when detected — this is what the per-name windowing can't handle (it
  // merges both names and steals/garbles the IBAN/Cod fiscal/Banca). When it fires, skip the
  // per-name orphan heuristic below (the columnar parties already carry the right requisites).
  const columnar = tryParseColumnarContract(text);
  if (columnar) {
    workingParties = columnar as typeof workingParties;
  }

  // Orphan-requisite attachment: a "Payment details / Beneficiary bank" section often sits at the
  // bottom, far from the supplier's name. If a paid-role party (provider/executor) is missing its
  // IBAN/bank and there's an unclaimed IBAN in a beneficiary/payment section, attach it to the
  // sole paid party rather than the payer it happened to fall next to.
  const paidParties = (columnar ? [] : workingParties).filter(
    (p) => p.role === "executor" || p.role === "provider",
  );
  const payerParties = workingParties.filter((p) => p.role === "client" || p.isPayerHint);
  if (paidParties.length === 1 && !paidParties[0].iban) {
    const paid = paidParties[0];
    // Consider every IBAN that sits under a beneficiary/payment-to/supplier label, even if it
    // got tentatively attached to a payer (the "Payment details / Beneficiary bank" footer steals
    // the supplier's IBAN otherwise — PAR-SCEN-07).
    for (const ib of ibans) {
      const ctx = text.slice(Math.max(0, ib.index - 130), ib.index);
      const beneficiaryCtx =
        /beneficiar|beneficiary|payee|furnizor|prestator|получател|payment\s*details|remit|pay\s*to|în\s*contul|на\s*расч[её]тный/i.test(
          ctx,
        );
      const payerCtx = /pl[ăa]titor|ordonator|плательщик|do\s*NOT\s*pay|client\s*settlement/i.test(ctx);
      const claimedByPayer = payerParties.some((pp) => pp.iban === ib.value);
      if (beneficiaryCtx && !payerCtx && (!claimedByPayer || true)) {
        paid.iban = ib.value;
        usedIban.add(ib.index);
        const after = text.slice(Math.max(0, ib.index - 130), ib.index + 160);
        const bankLine = after
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => isPayeeBank(l));
        if (!paid.bank && bankLine) paid.bank = cleanBankName(bankLine);
        // Detach from any payer that wrongly grabbed it.
        for (const pp of payerParties) {
          if (pp.iban === ib.value && pp !== paid) pp.iban = null;
        }
        break;
      }
    }
  }

  const parties: ParExtractedParty[] = workingParties.map((p) => {
    const { _roleLocked: _drop, ...rest } = p;
    return rest;
  });

  const hasIban = ibans.length > 0;
  const documentClass = classify(text, amountCents != null, hasIban);

  // hasPerPartyAmounts: 2+ distinct per-party sub-amounts (the total is split into tranches and
  // only one applies → don't default the amount to the total when asking who is paid).
  const distinctSub = new Set(subAmountByParty.values());
  // Also catch globally-listed tranches: "achită ... NN% (110 700,00 lei)" / "Сумма ...: 72 000,00 лей".
  const trancheRe =
    /(?:achit[ăa][^\n]*?\(|Сумма\s*(?:работ|поставки|услуг)?[^0-9\n]{0,8})(\d[\d .,]*\d)\s*(?:lei\)?|лей)/gi;
  let tm: RegExpExecArray | null;
  while ((tm = trancheRe.exec(text)) !== null) {
    const v = parseLocalizedAmount(tm[1]);
    if (v != null && v > 0) distinctSub.add(v);
  }
  // Zero the amount on clarification ONLY when the doc both splits into per-party tranches AND
  // explicitly says a SINGLE tranche applies (PAR-FIX-20). When the tranches simply sum to the
  // project total with no such note (PAR-DOC-15), keep the total.
  const singleTrancheNote =
    /o\s*singur[ăa]\s*tran[șs][ăa]|se\s*refer[ăa]\s*la\s*o\s*singur[ăa]|a\s*se\s*selecta\s*beneficiar|single\s*tranche|одну\s*транш/i.test(
      text,
    );
  const hasPerPartyAmounts = distinctSub.size >= 2 && singleTrancheNote;

  return purifyExtraction({
    parties,
    amountCents,
    amountConfidence: amountCents != null ? 0.85 : 0,
    currency: currency ?? (amountCents != null ? "MDL" : null),
    scope: extractScope(text),
    documentClass,
    documentClassReason: undefined,
    hasPerPartyAmounts,
  });
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/** A real bank name is short — anything longer means the window below still smuggled in
 * unrelated text (payee_bank is capped at 300 chars server-side; a longer value 400s the
 * PATCH with an unlabeled "String must contain at most 300 character(s)" that blocks the
 * whole draft from saving). */
const MAX_BANK_NAME_LEN = 100;

function cleanBankRequisites(line: string): { bank: string; bic: string | null } {
  // Bound to a window around the ACTUAL matched bank keyword, not the whole line. A genuine
  // "Banca: X" line is short, so this is a no-op there — but when the "line" is really one
  // PDF-collapsed blob (a party's name/address/IDNO/IBAN with no real newline between them and
  // a stray bank mention), isPayeeBank() only proves the blob CONTAINS a bank reference
  // somewhere; it does not mean the whole blob IS the bank name. Without this, a false-positive
  // match (e.g. a "conform cursului BNM" exchange-rate footer sitting on the same collapsed
  // line as the payee's requisites) swallowed the payee's quoted name + legal address whole
  // into the "Bancă" field.
  const m = findBankKeywordMatch(line);
  // Snap the window's start BACK to a word boundary: slicing at a fixed offset cut
  // "Banca Beneficiară:" into "iciară:", which then no longer looked like a label to the
  // strip below and shipped verbatim into the form's "Bancă" field (owner report 2026-08-25).
  const rawStart = Math.max(0, (m?.index ?? 0) - 20);
  const start = m ? (rawStart === 0 ? 0 : line.lastIndexOf(" ", rawStart) + 1) : 0;
  const windowed = m
    ? line.slice(start, Math.min(line.length, (m.index ?? 0) + m[0].length + 80))
    : line;
  // Drop a leading "Banca …:" label in any of its printed variants — "Banca:", "Banca
  // Beneficiară:", "Banca plătitorului:", "Банк:", "Beneficiary bank:" — up to its colon.
  // Colon-anchored on purpose: an un-anchored `Bank` lazy-matches the "bank" INSIDE
  // "Moldindconbank" and strips the bank's own name, leaving junk like "'S.A., MOLDMD2X".
  let s = windowed.replace(/^[^:\n]{0,40}?\b(?:Banca|Банк|Bank)\b[^:\n]{0,30}:\s*/i, "");
  s = s.replace(/^[,;:\-–\s]+/, "").trim();
  // A bank name never runs into the next requisite/address field — cut there too.
  s = s
    .replace(
      /,?\s*(?:cod(?:ul)?\s*b[ăa]nc\w*|cod\s*banc\w*|код\s*банка|BIC|SWIFT|IBAN|cod(?:ul)?\s*fiscal|IDNO|IDNP|ИДНО|mun\.|or\.|sat\.|str\.|bd\.|sediul\w*|adres[ăa]).*$/i,
      "",
    )
    .trim();
  // …iar codurile NEetichetate lipite de nume (BIC-ul de filială „AGRNMD2X885", un „c.f./ nr.TVA
  // 1014…") scapă de regula de mai sus, care se uită doar după etichete. Separatorul comun le taie
  // pe toate, cu aceleași reguli folosite la salvarea beneficiarului.
  const split = splitBankRequisites(s);
  if (split.bank) s = split.bank;
  s = s.replace(/\s+/g, " ").trim();
  return {
    bank: (s || windowed.trim()).slice(0, MAX_BANK_NAME_LEN),
    // The separator isolates an unlabelled BIC glued after the bank name
    // ("BC'Moldindconbank'S.A., MOLDMD2X") — surface it instead of discarding it
    // (that discard left the form's BIC/SWIFT box empty on the typized fiscal invoice).
    bic: split.bankCode,
  };
}

function cleanBankName(line: string): string {
  return cleanBankRequisites(line).bank;
}

/** A comma-segment that is an ADDRESS: street/city tokens or "nr./bl./of." + digit. */
const ADDR_SEGMENT_RE =
  /\b(?:mun|or|ora[șs]|sat|com|str|bd|sec[țt]?|SEC|et)\.\s*\S|\b(?:nr|bl|of|ap)\.?\s*\d|\bstrada\b|\bул\.|\bмун\.|Chi[șs]in[ăa]u|Кишин[её]в|B[ăa]l[țt]i|Бельцы/i;

/**
 * Unlabelled address sitting on the party's own NAME line — the typized fiscal invoice prints
 * `"DAIKIRI STUDIO" S.R.L., SEC.CENTRU Grenoble nr.159 bl.6 of.12 Cont MD05ML…`: the quoted-name
 * regex takes just the name, so the address between the legal form and the requisites was simply
 * DROPPED (never entered any field → nothing for the purity layer to relocate; owner report
 * 2026-08-25 #2). Only comma-segments that carry street/city tokens count — "prefer null over
 * wrong" still holds for everything else on the line.
 */
function extractNameLineAddress(text: string, hitIndex: number): string | null {
  const lineStart = text.lastIndexOf("\n", hitIndex) + 1;
  const lineEndRaw = text.indexOf("\n", hitIndex);
  const line = text.slice(lineStart, lineEndRaw === -1 ? text.length : lineEndRaw);
  // Cut the requisites tail: everything from the first account/fiscal marker onward.
  const cut = line.split(
    /\bCont(?:ul)?\b|\bIBAN\b|\bc\.?\s?f\.?\s*\/|\bcod\s*fiscal\b|\bIDNO\b|\bIDNP\b|\bИДНО\b|\bnr\.?\s*TVA\b|MD\d{2}[A-Z0-9]{20}/i,
  )[0];
  const segs = cut.split(",").map((x) => x.trim()).filter(Boolean);
  const addr = segs.filter(
    (x) => ADDR_SEGMENT_RE.test(x) && !LEGAL_FORM_RE.test(x) && !isPayeeBank(x),
  );
  if (!addr.length) return null;
  const a = addr.join(", ").replace(/\s+/g, " ").trim();
  return a.length >= 6 && a.length <= 300 ? a : null;
}

/** Address-context label anchors — only a LABELLED address is extracted (an unlabelled address
 * line is too easy to confuse with something else); "prefer null over wrong" per the LLM prompt's
 * own rule. */
const ADDRESS_LABEL_RE =
  /(?:cu\s+sediul(?:\s+social)?(?:\s*(?:în|in))?|sediul(?:\s+social)?(?:\s*(?:în|in))?|domiciliat[ăa]?\s*(?:în|in)|adresa(?:\s+juridic[ăa])?|registered\s*(?:address|office)|legal\s*address|beneficiary\s*address|юридическ\w*\s*адрес|\bадрес\b)\s*[:\.]?\s*/i;

/** Requisites that mark the end of an address value — an address never runs into these.
 * "Administrator"/"Director"/"Cont" were added 2026-08-25: on a one-line (collapsed) source they
 * are the ONLY thing standing between the address and the next requisite. */
const ADDRESS_STOP_RE =
  /[,;]?\s*(?:IBAN\b|cont\s*(?:bancar|curent|de\s*decontare)?\b|cod\s*fiscal\b|cod(?:ul)?\s*bancar\b|IDNO\b|IDNP\b|ИДНО\b|Banca\b|Bank\b|BIC\b|SWIFT\b|administrator\w*\b|director\w*\b|pre[șşs]edinte\w*\b|tel(?:efon)?\b|e-?mail\b|reprezentat\w*|denumit[ăa]?\s*în\s*continuare|в\s*лице)/i;

/**
 * The remainder of the line the label sits on.
 *
 * A LABELLED requisite value ends where its line ends — that is how every contract prints it.
 * Before PR #293 the PDF text arrived as one collapsed line so this boundary did not exist and
 * the extractors had to rely on a character window plus a stop-word list; with the real line
 * structure restored, the line IS the boundary, and the stop words stay as the guard for sources
 * that genuinely have no newlines (plain .txt exports, OCR blobs, the collapsed legacy path).
 */
function restOfLine(block: string, from: number, maxChars: number): string {
  const rest = block.slice(from, from + maxChars);
  const nl = rest.search(/\r?\n/);
  return nl >= 0 ? rest.slice(0, nl) : rest;
}

/** Extract a bounded legal-address snippet from a party's requisite block. Bounded by the label's
 * own line first (see restOfLine), then by the stop-word list within that line. */
function extractAddressSnippet(block: string): string | null {
  const m = ADDRESS_LABEL_RE.exec(block);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = restOfLine(block, start, 160);
  const stop = rest.search(ADDRESS_STOP_RE);
  const cut = (stop >= 0 ? rest.slice(0, stop) : rest).replace(/\s+/g, " ").trim();
  const snippet = cut.replace(/^[,:\-–\s]+/, "").replace(/[,;\s]+$/, "");
  return snippet.length >= 4 ? snippet.slice(0, 200) : null;
}

/** The role nouns a signatory is introduced by, in every declension the documents print
 * ("Administrator," / "în persoana Administratorului," / "Președintelui" / "Director general"). */
// Longest suffix FIRST in every alternation: `(?:ul|ului)` would match "Directorul" inside
// "Directorului" and stop, leaving "ui, Elena Roșca" — and because everything after the label is
// optional, the regex has no reason to backtrack, so the name is silently lost.
const ADMIN_ROLE_NOUN =
  "(?:administrator(?:ului|ul)?|director(?:ului|ul)?(?:\\s+general)?|pre[șşs]edinte(?:lui|le)?|reprezentant(?:ului|ul)?(?:\\s+legal)?|gerant(?:ului|ul)?)";

/** Administrator/representative label anchors — same "labelled only" discipline as the address.
 * Either an introducing phrase ("reprezentată de", "în persoana", "в лице") optionally followed by
 * the role noun, or the bare role noun on a signature line ("Preşedinte, Ilie CHIRTOACĂ"). The
 * separator allows a COMMA: that is how every signature block prints it. */
const ADMINISTRATOR_LABEL_RE = new RegExp(
  `(?:(?:reprezentat[ăa]?\\s+(?:de|prin)|[iî]n\\s+persoana|в\\s+лице)\\s*(?:${ADMIN_ROLE_NOUN})?|${ADMIN_ROLE_NOUN})` +
    `\\s*[:,.\\-–]?\\s*(?:dl\\.|dna\\.?|dnul|domnul|doamna|г-н|г-жа)?\\s*`,
  "i",
);

/** Words that begin the NEXT requisite, so they can never be part of a person's name. On a
 * source with real newlines restOfLine() already stops there; this is the same boundary for a
 * collapsed one-line source, where "Administrator: Vasile Popescu Cont bancar (IBAN): …" would
 * otherwise read as the three-word name "Vasile Popescu Cont". */
const REQUISITE_WORD_RE =
  /\b(?:cont|banca|bank|IBAN|BIC|SWIFT|cod|codul|adresa|sediul|tel|telefon|e-?mail|IDNO|IDNP)\b/i;

/** Extract a bounded "reprezentată de <Name>" style administrator name. Only accepts an
 * immediately-following capitalized 2-3 word run (a real person name) — never a whole clause.
 * A surname printed in CAPS ("Ilie CHIRTOACĂ", "Dumitru VLAH") is the MD-contract norm, so
 * every word after the first may be either Titlecase or ALLCAPS. */
function extractAdministratorSnippet(block: string): string | null {
  const m = ADMINISTRATOR_LABEL_RE.exec(block);
  if (!m) return null;
  // Bounded by the label's own line: "Administrator: Vasile Popescu\nCont bancar (IBAN): …" used
  // to yield "Vasile Popescu\nCont", because `\s+` between the name's words matches a NEWLINE and
  // happily borrowed the first word of the next line. Inside the line the separator is a real
  // space/tab only, for the same reason.
  const rest = restOfLine(block, m.index + m[0].length, 60).split(REQUISITE_WORD_RE)[0];
  const name = rest.match(
    /^[A-ZĂÂÎȘȚА-ЯЁ][a-zăâîșțа-яё'’-]+(?:[ \t]+[A-ZĂÂÎȘȚА-ЯЁ](?:[a-zăâîșțа-яё'’-]+|[A-ZĂÂÎȘȚА-ЯЁ]+)){1,2}/,
  );
  return name ? name[0].trim() : null;
}

/** A SWIFT/BIC is 8 or 11 chars: 6 letters (bank+country) + 2 alnum + optional 3-alnum branch. */
const BIC_SHAPE_RE = /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;

/** Extract a labelled SWIFT/BIC ("Codul Băncii: VICBMD2X457", "BIC: AGRNMD2X"). The stub never
 * filled this field at all, so the form's "BIC / SWIFT" box stayed empty on documents that
 * print it plainly. Labelled-only + strict shape, so an IBAN or a bank code can't land here. */
function extractBicSnippet(block: string): string | null {
  const re = /(?:cod(?:ul)?\s*b[ăa]nc\w*|cod\s*banc\w*|код\s*банка|BIC|SWIFT|S\.W\.I\.F\.T\.?)[^A-Za-z0-9]{0,10}([A-Za-z0-9]{8,11})\b/i;
  const m = re.exec(block);
  if (!m) return null;
  const v = m[1].toUpperCase();
  return BIC_SHAPE_RE.test(v) ? v : null;
}

/** A capture that is really a TABLE COLUMN HEADER, not the object of the payment —
 * "Denumirea mărfurilor/activelor, serviciilor şi codul poziţiei tarifare…" on the
 * typized MD fiscal invoice. Header vocabulary, in any of the form's languages. */
const SCOPE_HEADER_RE =
  /codul\s*pozi[țt]iei|tarifare|unitate\s*de\s*m[ăa]sur|pre[țt]\s*unitar|cantitat|Наименование\s*товаров|товарной\s*позиции|единиц\w*\s*измерен|^\s*(?:qty|quantity)\b|\bunit\s*price\b|\bqty\b.*\bamount\b|\bcant\.?\b.*\b(?:pre[țt]|sum[ăa])\b|\bpre[țt]\b.*\bsuma\b|\bcol(?:oana|umn)\b/i;

function extractScope(text: string): string | null {
  const re =
    /(?:OBIECTUL(?:\s*CONTRACTULUI)?|Denumire(?:a)?\s*(?:m[ăa]rfii)?[\/]?(?:serviciu(?:lui)?)?|Description|Destina[țt]ia\s*pl[ăa][țt]ii|Reprezent[âa]nd|Наименование\s*работ|ПРЕДМЕТ\s*ДОГОВОРА|Основание|Obiectul)\s*[:\.]?\s*([^\n]{3,90})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = m[1]
      .replace(/\s+/g, " ")
      .trim()
      // Drop a leading clause number ("1.1 Prestatorul este contractat…") — it belongs to the
      // contract's numbering, not to the description of what is being paid for.
      .replace(/^\d+(?:\.\d+)*\.?\s+/, "")
      .replace(/[.;]+$/, "");
    if (!s || SCOPE_HEADER_RE.test(s)) continue; // header row, not the real object
    return s.slice(0, 90);
  }
  // Fallback (fiscal-invoice table body): the service row itself — "Servicii predare curs
  // «X» serv 1 17000.00 …". Take the descriptive head of the row, cut at the qty/price tail.
  const rowRe = /^\s*(Servicii|Lucr[ăa]ri|Presta(?:re|ri)|Услуги|Работы)\b([^\n]{3,120})/im;
  const rm = text.match(rowRe);
  if (rm) {
    const row = `${rm[1]}${rm[2]}`
      .replace(/\s+(?:serv|buc|un|шт|ore|h)?\.?\s*\d[\d .,]*.*$/i, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.;,]+$/, "");
    if (row.length >= 8 && !SCOPE_HEADER_RE.test(row)) return row.slice(0, 90);
  }
  return null;
}

/** A per-party amount inside a single party block (sub-total / tranche). */
function extractSubAmount(block: string): number | null {
  const re =
    /(?:Сумма\s*(?:работ|поставки|услуг)?|Suma\s*lucr\w*|achit[ăa]\s+\w*\s*\d{0,3}%?\s*\(([^)]*)\))[^0-9(]{0,10}([\d .,]+\d)/i;
  const m = block.match(re);
  if (m) {
    const raw = (m[1] && /\d/.test(m[1]) ? m[1] : m[2]) ?? "";
    const v = parseLocalizedAmount(raw);
    if (v != null && v > 0) return v;
  }
  // RO tranche form: "(110 700,00 lei)" near an "achită" verb.
  const tranche = block.match(/achit[ăa][^\n]*?\((\d[\d .,]*\d)\s*lei\)/i);
  if (tranche) {
    const v = parseLocalizedAmount(tranche[1]);
    if (v != null && v > 0) return v;
  }
  return null;
}
