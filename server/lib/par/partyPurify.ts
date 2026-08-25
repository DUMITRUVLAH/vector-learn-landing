/**
 * PAR AI multi-party extraction — universal party-field purity layer.
 *
 * THE invariant this module enforces, for ANY document type and BOTH extraction
 * paths (LLM and regex stub): **each field holds only the info destined for it.**
 * A party's `name` holds ONLY the legal name — never a role label (Furnizor /
 * Поставщик / Supplier…), never an address, never an IBAN / fiscal code / bank /
 * BIC. Anything else found inside `name` is RELOCATED to its own (empty) field,
 * not just deleted — the info was in the document, so losing it is also a bug
 * (the 2026-08-25 fiscal-invoice case: the payee's legal address sat inside
 * "Denumire companie" while "Adresă juridică" stayed empty).
 *
 * Values are recognized by FORMAT/semantics (an IBAN is MD+2 digits+20 alnum
 * wherever it appears), never by document layout — that is what makes this run
 * identically on a contract, a fiscal invoice, a foreign invoice, a receipt or
 * a PAR form. `repaired` flags record every relocation/strip so the API can
 * surface honest low-confidence markers instead of hardcoded trust.
 */

import type { ParExtractedParty } from "./parPartyTypes";
import { isPayeeBank, findBankKeywordMatch } from "./payeeBankClassifier";

// ─── Format recognizers ───────────────────────────────────────────────────────

/** MD IBAN or plausible foreign IBAN, with an optional "Cont"/"Cont nr." label prefix. */
const IBAN_IN_TEXT_RE =
  /(?:\bCont(?:ul)?(?:\s*(?:de\s*decontare|bancar|nr\.?|:))?\s*)?\b(MD\d{2}[A-Z0-9]{20}|(?!MD)[A-Z]{2}\d{2}[A-Z0-9]{11,30})\b\s*[,;]?/g;

/** Labelled SWIFT/BIC anywhere, or an unlabelled Moldovan bank BIC (XXXXMD2X shape). */
const BIC_IN_TEXT_RE =
  /(?:\b(?:BIC|SWIFT)\b\s*[:\-]?\s*([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)|\b([A-Z]{4}MD2[A-Z0-9])\b)\s*[,;]?/g;

/** A 13-digit fiscal id (IDNO/IDNP), with any of its label spellings as optional prefix. */
const FISCAL_IN_TEXT_RE =
  /(?:\b(?:c\.?\s?f\.?|cod\s*fiscal|IDNO|IDNP|ИДНО|nr\.?\s*TVA)\b[\s./:]{0,6}){0,3}\b(\d{13})\b\s*[,;/]?/gi;

/** Leftover requisite labels with no value attached ("c.f./ nr.TVA /" tails on fiscal forms). */
const BARE_LABEL_RE =
  /\b(?:c\.?\s?f\.?\s*\/?\s*)?(?:nr\.?\s*TVA|cod\s*fiscal|IDNO|IDNP|ИДНО|ф\.?к\.?|код\s*НДС)\b[\s./:]*|\bCont(?:ul)?\s*(?:nr\.?|bancar|de\s*decontare)?\s*:?\s*(?=$|[,;])/gi;

/**
 * Role labels in RO/RU/EN — semantic markers that are NEVER part of a legal name,
 * with or without ":" (bilingual fiscal forms print them with the colon on the
 * previous line). May be stacked ("Furnizor: Поставщик …") → stripped in a loop.
 */
const ROLE_LABEL_PREFIX_RE =
  /^(?:\(?\d+\)?\s*[.):]\s*)?(?:Furnizor(?:ul)?|Поставщик|Prestator(?:ul)?|Исполнитель|Executor(?:ul)?|V[âa]nz[ăa]tor(?:ul)?|Cump[ăa]r[ăa]tor(?:ul)?(?:\s*\/\s*beneficiar\w*)?|Покупатель(?:\s*\/\s*получатель)?|Получатель(?:\s*платеж\w*)?|Beneficiar(?:ul)?(?:\s*pl[ăa][țt]ii)?|Pl[ăa]titor(?:ul)?|Плательщик|Заказчик|Client(?:ul)?|Supplier|Seller|Buyer|Contractor|Payee|Bill\s*(?:From|To)|Antreprenor(?:ul)?(?:\s+General)?|Subantreprenor(?:ul)?|Подрядчик|Субподрядчик)(?:\s*[:：]\s*|\s+)/i;

/** A comma-segment that is an ADDRESS, not a name: street/city tokens or "nr./bl./of." + digit. */
const ADDRESS_SEGMENT_RE =
  /\b(?:mun|or|ora[șs]|sat|com|str|bd|sec[țt]?|SEC|et)\.\s*\S|\b(?:nr|bl|of|ap)\.?\s*\d|\bstrada\b|\bсело\b|\bул\.|\bмун\.|\bг\.\s|Chi[șs]in[ăa]u|Кишин[её]в|B[ăa]l[țt]i|Бельцы/i;

const LEGAL_FORM_RE =
  /\b(S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?|A\.?\s?O\.?|Î\.?\s?I\.?|ÎI|ООО|ОАО|ЗАО|GmbH|LLC|Ltd|Inc\.?|SRL|SA)\b/i;

function tidy(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s*([,;/])\s*/g, "$1 ")
    .replace(/(?:[,;/]\s*)+(?=[,;/]|$)/g, "")
    .replace(/^[\s,;:/\-–]+|[\s,;:/\-–]+$/g, "")
    .trim();
}

/** Fields the purifier had to repair (relocate into, or strip junk out of). */
export interface RepairedFlags {
  name?: boolean;
  idno?: boolean;
  iban?: boolean;
  bank?: boolean;
  bic?: boolean;
  legalAddress?: boolean;
}

/**
 * Decompose a party whose fields may contain each other's data, and put every
 * recognized value in its own slot. Conservative: relocation only fills EMPTY
 * fields; an already-populated field is never overwritten by a guess.
 */
export function purifyParty(p: ParExtractedParty): ParExtractedParty {
  const repaired: RepairedFlags = { ...(p.repaired ?? {}) };
  let name = p.name ?? "";
  let idno = p.idno ?? null;
  let iban = p.iban ?? null;
  let bank = p.bank ?? null;
  let bic = p.bic ?? null;
  let legalAddress = p.legalAddress ?? null;
  const originalName = name;

  // 0. Clean the BANK slot first: a BIC glued to it moves to `bic`; a remnant that
  //    isn't a bank name at all ("'S.A., MOLDMD2X" leftovers) is dropped, so that a
  //    real bank found inside `name` (step 4) can take the slot.
  if (bank) {
    let b = bank;
    // An IBAN printed next to the bank ("c/d MD87… în BC «Mobiasbanca» S.A.") belongs to the
    // IBAN field — the bank slot must never display an account number.
    b = b.replace(IBAN_IN_TEXT_RE, (_full, value: string) => {
      if (!iban) {
        iban = value;
        repaired.iban = true;
      }
      repaired.bank = true;
      return " ";
    });
    b = b.replace(FISCAL_IN_TEXT_RE, (_full, digits: string) => {
      if (!idno) {
        idno = digits;
        repaired.idno = true;
      }
      repaired.bank = true;
      return " ";
    });
    BIC_IN_TEXT_RE.lastIndex = 0;
    const bm = BIC_IN_TEXT_RE.exec(b);
    if (bm) {
      if (!bic) {
        bic = bm[1] ?? bm[2];
        repaired.bic = true;
      }
      b = tidy(b.replace(bm[0], " "));
    }
    // Re-window a keyword-bearing value to its comma segment and shed leading digit
    // junk — an extraction window that started mid-IBAN ("…001296, BC'Moldindconbank'…")
    // must not leave the IBAN tail glued to the bank name.
    const kb = findBankKeywordMatch(b);
    if (kb && kb.index != null) {
      const s0 = b.lastIndexOf(",", kb.index) + 1;
      const e0raw = b.indexOf(",", kb.index + kb[0].length);
      const e0 = e0raw === -1 ? b.length : e0raw;
      b = tidy(b.slice(s0, e0).replace(/^[\d ,.;:-]+/, "").replace(/^(?:[îi]n|la|prin|в)\s+/i, ""));
    }
    if (b !== bank) repaired.bank = true;
    if (b && !isPayeeBank(b) && !/\bbanc|банк|bank/i.test(b)) {
      // What's left doesn't look like a bank in any language → junk, not a bank name.
      b = "";
      repaired.bank = true;
    }
    bank = b || null;
  }

  // 1. Role labels are semantic markers, never part of the name — strip them
  //    wherever they lead, colon or not, possibly stacked bilingually.
  for (let i = 0; i < 3; i++) {
    const stripped = name.replace(ROLE_LABEL_PREFIX_RE, "");
    if (stripped === name) break;
    name = stripped;
    repaired.name = true;
  }

  // 2. IBANs inside the name → the IBAN slot.
  name = name.replace(IBAN_IN_TEXT_RE, (full, value: string) => {
    if (!iban) {
      iban = value;
      repaired.iban = true;
    }
    repaired.name = true;
    return " ";
  });

  // 3. BIC/SWIFT inside the name → the BIC slot.
  name = name.replace(BIC_IN_TEXT_RE, (full, labelled: string | undefined, bare: string | undefined) => {
    if (!bic) {
      bic = labelled ?? bare ?? null;
      repaired.bic = true;
    }
    repaired.name = true;
    return " ";
  });

  // 4. 13-digit fiscal ids inside the name → the IDNO slot.
  name = name.replace(FISCAL_IN_TEXT_RE, (full, digits: string) => {
    if (!idno) {
      idno = digits;
      repaired.idno = true;
    }
    repaired.name = true;
    return " ";
  });

  // 5. A bank name inside the name → the bank slot. Window = the bank KEYWORD plus a
  //    short bank-ish prefix (BC / B.C. / opening quote) up to the next comma — never
  //    the whole comma segment, which can still hold the party's address once earlier
  //    removals ate the separating comma.
  const bm = findBankKeywordMatch(name);
  if (bm && bm.index != null) {
    const segStart = name.lastIndexOf(",", bm.index) + 1;
    const segEndRaw = name.indexOf(",", bm.index + bm[0].length);
    const segEnd = segEndRaw === -1 ? name.length : segEndRaw;
    const prefix = name.slice(Math.max(segStart, bm.index - 12), bm.index);
    const pm = prefix.match(/(?:\bB\.?C\.?\s*['"«“]?|['"«“])\s*$/i);
    const bankStart = pm ? bm.index - pm[0].length : bm.index;
    const candidate = tidy(name.slice(bankStart, segEnd));
    if (candidate && isPayeeBank(candidate) && candidate.length <= 100) {
      if (!bank) {
        bank = candidate;
        repaired.bank = true;
      }
      name = `${name.slice(0, bankStart)} ${name.slice(segEnd)}`;
      repaired.name = true;
    }
  }

  // 6. Leftover valueless labels ("c.f./ nr.TVA /") + punctuation runs.
  const preLabel = name;
  name = name.replace(BARE_LABEL_RE, " ");
  if (name !== preLabel) repaired.name = true;
  name = tidy(name);

  // 7. Address segments inside the name → the legalAddress slot. Segment on commas;
  //    a segment with street/city tokens is an address, the rest is the name.
  const segments = name.split(",").map((s) => tidy(s)).filter(Boolean);
  const nameSegs = segments.filter((s) => !ADDRESS_SEGMENT_RE.test(s));
  const addrSegs = segments.filter((s) => ADDRESS_SEGMENT_RE.test(s));
  if (addrSegs.length > 0 && nameSegs.length > 0) {
    if (!legalAddress) {
      legalAddress = addrSegs.join(", ");
      repaired.legalAddress = true;
    }
    name = nameSegs.join(", ");
    repaired.name = true;
  }

  // 8. If a legal form is present, the name ends with it — trim any tail that
  //    slipped past the filters ("VECTOR ACADEMY S.R.L. / restul").
  const lf = LEGAL_FORM_RE.exec(name);
  if (lf && lf.index + lf[0].length < name.length) {
    const tail = name.slice(lf.index + lf[0].length);
    // Only cut a tail that is clearly non-name junk (starts with a separator).
    if (/^\s*[/;]/.test(tail)) {
      name = tidy(name.slice(0, lf.index + lf[0].length));
      repaired.name = true;
    }
  }

  // Legal names carry no meaningful quotes (same rule as the stub's cleanName).
  // Cosmetic strip — not a repair worth flagging.
  name = tidy(name.replace(/["“”„«»]/g, " ")) || name;
  // Never nuke the name entirely — a wrong-but-visible name beats an empty one.
  if (!name) {
    name = tidy(originalName) || originalName;
    repaired.name = true;
  }

  return {
    ...p,
    name,
    idno,
    iban,
    bank,
    bic,
    legalAddress,
    repaired: Object.keys(repaired).length ? repaired : undefined,
  };
}

/** Purify every party of an extraction (single choke point for both AI paths). */
export function purifyExtraction<T extends { parties: ParExtractedParty[] }>(ext: T): T {
  return { ...ext, parties: ext.parties.map(purifyParty) };
}
