/**
 * PAR AI multi-party extraction — cross-field sanity checks.
 *
 * Documents vary wildly in layout/language/OCR quality, so neither extraction path (the LLM or
 * the deterministic regex stub) can be trusted to always put the right VALUE in the right SLOT —
 * a value can bleed across fields (a company's own name + legal address ending up in "Bancă",
 * see PAR bug 2026-08-25) or simply be mislabeled (an IDNO sitting where the IBAN was expected).
 * `routeIdAndIban` (choosePayee.ts) already does this cross-check for idno/iban; this module
 * extends the same "does this value actually look like what its slot claims?" discipline to
 * bank/legalAddress/administratorName, and is the single place both extraction paths funnel
 * through (via choosePayee), so the check runs regardless of which document format produced it.
 */

const ADDRESS_MARKER_RE =
  /\b(mun\.|or\.|sat\.|str\.|bd\.|sediul\w*|adres[ăa]|Chi[sș]in[ăa]u|Chisinau|B[ăa]l[țt]i)\b/i;
const LEGAL_FORM_SUFFIX_RE =
  /\b(S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?|A\.?\s?O\.?|Î\.?\s?I\.?|ÎI|GmbH|LLC|Ltd|ООО|ОАО|ЗАО)\b/i;

/** A real bank name is short; an address/company-name blob is not (mirrors the cap already
 * applied in stubPartyParser.cleanBankName / parExtractor.normalizeParExtraction — kept here
 * too so this check is correct standalone, independent of which extractor produced the value). */
const MAX_BANK_LEN = 100;
const MAX_ADDRESS_LEN = 500;
const MAX_PERSON_NAME_LEN = 150;

/** True for a bare 13-digit fiscal id (IDNO/IDNP), spaces allowed. */
export function looksLikeFiscalId(s: string): boolean {
  return /^\d{13}$/.test(s.replace(/\s+/g, ""));
}

/** True for an MD or well-formed foreign IBAN shape (format only — mod-97 is routeIdAndIban's job). */
export function looksLikeIban(s: string): boolean {
  const v = s.replace(/\s+/g, "").toUpperCase();
  return /^MD\d{2}[A-Z0-9]{20}$/.test(v) || /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v);
}

export interface SanitizedRequisites {
  bank: string | null;
  legalAddress: string | null;
  administratorName: string | null;
  /** An idno/iban-shaped value found in the WRONG slot (typically `bank`) — feed back into
   * routeIdAndIban alongside the party's own idno/iban so a genuinely misplaced value is still
   * recovered, the same way routeIdAndIban already recovers a 13-digit value sitting in `iban`. */
  recoveredIdno: string | null;
  recoveredIban: string | null;
}

/**
 * Reclassifies or drops bank/legalAddress/administratorName values that don't match what their
 * slot claims to be. A dropped/reclassified value is strictly safer than a wrong one: AI-filled
 * fields are already marked "de verificat" in the UI, so an emptied field just asks the user to
 * fill it in — a wrong one (a company's address inside "Bancă") silently corrupts the payee
 * record and can hard-block the save (a long blob failing the DB column's length limit).
 */
export function sanitizeRequisites(p: {
  bank?: string | null;
  legalAddress?: string | null;
  administratorName?: string | null;
}): SanitizedRequisites {
  let bank = p.bank?.trim() || null;
  let legalAddress = p.legalAddress?.trim() || null;
  let administratorName = p.administratorName?.trim() || null;
  let recoveredIdno: string | null = null;
  let recoveredIban: string | null = null;

  if (bank) {
    if (looksLikeFiscalId(bank)) {
      recoveredIdno = bank.replace(/\s+/g, "");
      bank = null;
    } else if (looksLikeIban(bank)) {
      recoveredIban = bank.replace(/\s+/g, "").toUpperCase();
      bank = null;
    } else if (ADDRESS_MARKER_RE.test(bank) || bank.length > MAX_BANK_LEN) {
      bank = null;
    }
  }

  if (legalAddress) {
    if (looksLikeFiscalId(legalAddress) || looksLikeIban(legalAddress)) {
      legalAddress = null;
    } else if (legalAddress.length > MAX_ADDRESS_LEN) {
      legalAddress = legalAddress.slice(0, MAX_ADDRESS_LEN);
    }
  }

  if (administratorName) {
    if (
      looksLikeFiscalId(administratorName) ||
      looksLikeIban(administratorName) ||
      LEGAL_FORM_SUFFIX_RE.test(administratorName) || // a person's name never carries a company legal form
      administratorName.length > MAX_PERSON_NAME_LEN
    ) {
      administratorName = null;
    }
  }

  return { bank, legalAddress, administratorName, recoveredIdno, recoveredIban };
}
