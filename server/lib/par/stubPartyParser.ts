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
import { isPayeeBank } from "./payeeBankClassifier";

// ─── Low-level token extractors (exported for unit tests) ─────────────────────

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
  /Итого\s*к\s*оплате/i,
  /всего/i,
  /сумма\s*к\s*оплате/i,
  /Valoarea\s*total[ăa]/i,
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
 * A money-shaped number: a decimal with grouping, OR followed by a currency word/symbol.
 * Avoids matching list prefixes ("3.1."), dates, article numbers, percentages.
 */
const MONEY_NUM_RE =
  /(\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{2})?|\d+[.,]\d{2}|\d{3,})\s*(?:lei|лей|леев|MDL|€|EUR|\$|USD|\)|$)/i;

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
      const numMatch = window.match(MONEY_NUM_RE);
      if (!numMatch) continue;
      const major = parseLocalizedAmount(numMatch[1]);
      if (major == null || major <= 0) continue;
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
    /((?:Întreprinderea\s+Individual[ăa]\s+|Intreprinderea\s+Individuala\s+|SC\s+|ООО\s+|ОАО\s+|ЗАО\s+|SRL\s+|S\.?A\.?\s+|Î\.?\s?I\.?\s+|ÎI\s+)?["“„«][^"“”„«»\n]{1,80}["”»](?:\s+(?:S\.?R\.?L\.?|S\.?A\.?|A\.?O\.?|SRL|SA))?)/g;
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
    // Reject single-word defined-term labels in quotes ("Clientul", "Antreprenorul", «наш фонд»)
    // that carry NO legal form and aren't multi-word company names.
    const inner = raw.replace(/^[^"“„«]*["“„«]/, "").replace(/["”»].*$/, "").trim();
    const hasLegalForm = LEGAL_FORM_RE.test(raw);
    const innerWords = inner.split(/\s+/).filter(Boolean);
    const isDefinedTerm =
      innerWords.length === 1 &&
      !hasLegalForm &&
      /^(Clientul|Antreprenorul|Subantreprenorul|Prestatorul|Executorul|Beneficiarul|Furnizorul|наш\b)/i.test(inner);
    if (isDefinedTerm) continue;
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

  // 4. Person-like "Prenume Nume" runs (latin or cyrillic), e.g. "Gheorghe Rusu".
  //    Only after a "Primit de:" / "Prestator:" style label to avoid grabbing director names.
  const personLabelRe =
    /(?:Primit\s*de|Prestator(?:ul)?|Получатель|Получает)\s*[:\-]?\s*([A-ZĂÂÎȘȚА-ЯЁ][a-zăâîșțа-яё]+(?:\s+[A-ZĂÂÎȘȚА-ЯЁ][a-zăâîșțа-яё]+){1,2})/g;
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

/**
 * Turn a document's raw text into a structured multi-party extraction.
 * Deterministic & pure.
 */
export function parsePartiesFromText(docText: string): Omit<ParPartiesExtraction, "isStub"> {
  const text = docText ?? "";

  const ibans = findIbanCandidates(text);
  const ids = findIdCandidates(text);
  const vats = findVatCandidates(text);
  const { amountCents, currency } = extractAmount(text);
  const anchors = findRoleAnchors(text);

  // Discover party names, sorted by position; dedupe by normalized name (keep first occurrence,
  // which is usually the labelled header, then merge requisites from later occurrences).
  const nameHits = findNameHits(text).sort((a, b) => a.index - b.index);

  // Build, per distinct name, the role + windowed requisites.
  type WorkingParty = ParExtractedParty & { _roleLocked?: boolean };
  const partyMap = new Map<string, WorkingParty>();
  const usedIban = new Set<number>();
  const usedId = new Set<number>();
  const subAmountByParty = new Map<string, number>();

  for (const hit of nameHits) {
    const key = hit.name.toLowerCase();
    const { role, payerHint } = roleForName(hit.index, anchors);

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
    const bank = bankLine ? cleanBankName(bankLine) : null;
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
      if (!existing.vatCode && blockVat) existing.vatCode = blockVat.value;
      // Prefer a paid role if a later anchor disambiguates it (e.g. rechizite under "EXECUTOR").
      if (
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
      vatCode: blockVat?.value ?? null,
      isPayerHint: payerHint,
      // Lock a confidently-labelled role (a real anchor right before the name).
      _roleLocked: role !== "unknown",
    };
    partyMap.set(key, party);
  }

  const workingParties = [...partyMap.values()];

  // Orphan-requisite attachment: a "Payment details / Beneficiary bank" section often sits at the
  // bottom, far from the supplier's name. If a paid-role party (provider/executor) is missing its
  // IBAN/bank and there's an unclaimed IBAN in a beneficiary/payment section, attach it to the
  // sole paid party rather than the payer it happened to fall next to.
  const paidParties = workingParties.filter(
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

  return {
    parties,
    amountCents,
    amountConfidence: amountCents != null ? 0.85 : 0,
    currency: currency ?? (amountCents != null ? "MDL" : null),
    scope: extractScope(text),
    documentClass,
    documentClassReason: undefined,
    hasPerPartyAmounts,
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function cleanBankName(line: string): string {
  // Drop leading "Banca:", "Банк:", "Bank:", "Banca benef.:", "Beneficiary bank:" labels.
  let s = line.replace(
    /^.*?(?:Banca(?:\s*(?:plătitorului|beneficiarului|benef\.?))?|Банк|Bank|Beneficiary\s*bank|Банк)\s*:?\s*/i,
    "",
  );
  s = s.replace(/^[,;:\-–\s]+/, "").trim();
  s = s.replace(/,\s*(?:cod\s*banc|код\s*банка|BIC|SWIFT).*$/i, "").trim();
  s = s.replace(/\s+/g, " ").trim();
  return s || line.trim();
}

function extractScope(text: string): string | null {
  const re =
    /(?:OBIECTUL(?:\s*CONTRACTULUI)?|Denumire(?:a)?\s*(?:m[ăa]rfii)?[\/]?(?:serviciu(?:lui)?)?|Description|Destina[țt]ia\s*pl[ăa][țt]ii|Reprezent[âa]nd|Наименование\s*работ|ПРЕДМЕТ\s*ДОГОВОРА|Основание|Obiectul)\s*[:\.]?\s*([^\n]{3,90})/i;
  const m = text.match(re);
  if (m) {
    const s = m[1].replace(/\s+/g, " ").trim().replace(/[.;]+$/, "");
    if (s) return s.slice(0, 90);
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
