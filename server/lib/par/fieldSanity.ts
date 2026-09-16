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

import { isPayeeBank } from "./payeeBankClassifier";

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
      // Numele unei FILIALE conține legitim un oraș („B.C. VICTORIABANK S.A. fil.nr.26 Chisinau",
      // „Maib, filiala nr. 3 Bălți"): a arunca tot câmpul lăsa „Bancă" gol pe o factură care o
      // scria negru pe alb. Când valoarea chiar e un nume de bancă, tăiem doar coada de adresă.
      const cut = bank.search(ADDRESS_MARKER_RE);
      const trimmed = cut > 0 ? bank.slice(0, cut).replace(/[\s,;.\u2013-]+$/, "").trim() : "";
      bank = trimmed && isPayeeBank(trimmed) ? trimmed.slice(0, MAX_BANK_LEN) : null;
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

/**
 * Curăță un câmp de identitate lipit dintr-un PDF.
 *
 * Pe producție (16.09.2026) o cerere avea în `payee_bank` textul
 * „iciară: VictoriaBank S.A. fil. Nr. 17 Codul Băncii: VICBMD2X457 Codul IBAN: MD80VI…
 * Preşedinte, Ilie CHIRTOACĂ S.C." — o selecție din PDF care a început la mijlocul cuvântului
 * „Beneficiară" și a înghițit trei etichete următoare. Nimic din asta nu e un nume de bancă, dar
 * a ajuns în baza de date și de acolo în comparații, ca „neconcordanță".
 *
 * Taie la prima etichetă de rechizit care începe după text, scoate rândurile multiple și
 * limitează lungimea. Nu ghicește valoarea corectă — doar refuză să stocheze un paragraf acolo
 * unde încape un nume.
 */
const REQUISITE_LABEL_RE =
  /\s*\b(cod(ul)?\s+(b[ăa]ncii|iban|fiscal)|iban|idno|idnp|c\/f|c\/b|pre[sșş]edinte|director|administrator|semn[ăa]tur|[îi]n\s+persoana)\b\s*:?.*$/iu;

export function cleanPastedIdentityField(raw: string | null | undefined, maxLen = 200): string | null {
  if (raw == null) return null;
  let v = String(raw).replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!v) return null;
  v = v.replace(REQUISITE_LABEL_RE, "").trim();
  // O selecție începută la mijlocul unei etichete („…iciară: X") lasă gunoi înainte de „:".
  const afterLabel = v.match(/^[^:]{0,30}:\s*(.+)$/);
  if (afterLabel && afterLabel[1].trim()) v = afterLabel[1].trim();
  v = v.replace(/[\s,;.]+$/, "").trim();
  if (!v) return null;
  return v.length > maxLen ? v.slice(0, maxLen).trim() : v;
}
