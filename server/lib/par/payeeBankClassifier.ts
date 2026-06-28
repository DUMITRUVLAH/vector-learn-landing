/**
 * PAR-F3: Bank-name classifier.
 *
 * Exported pure functions (no I/O, no DB) for detecting whether a payee name
 * refers to a BANK/financial institution rather than the actual beneficiary.
 * Used by parAiPrefill.ts to route vendor_name to payeeBank vs payeeName.
 *
 * Works entirely from string patterns — no network, no API key needed (stub-safe).
 */

/**
 * Romanian/CIS bank and financial-institution name patterns.
 * Covers: BC (Bancă Comercială), Banca/Bank, Maib, credit institutions, savings casses, etc.
 */
const BANK_KEYWORDS_RE =
  /^BC\s|^Banca\s|^Bank\s|\bBancă\b|\bBanca\b|\bBank\b|Moldindconbank|Maib\b|Victoriabank|Moldova\s*Agroindbank|Energbank|Fincombank|Eximbank|ProCredit|Mobiasbancă|Mobiasbanca|Microcredit|BNMI|BNM\b|Savings\s*Bank|\bS\.A\.\s*Banca|\bCredit\s*Suisse|\bBancorp|\bB\.C\.\s/i;

/**
 * Returns true if the given name appears to be a bank or financial institution.
 *
 * @example
 *   isPayeeBank("BC Moldindconbank S.A.") // true
 *   isPayeeBank("Ion Popescu")            // false
 *   isPayeeBank("Maib")                  // true
 */
export function isPayeeBank(name: string): boolean {
  if (!name || name.trim().length === 0) return false;
  return BANK_KEYWORDS_RE.test(name);
}

/**
 * Attempt to extract the actual beneficiary from a vendor_name string
 * that may contain "Beneficiar: <name>" embedded in text (some OCR outputs include
 * structured data in a single field). Returns null if no embedded beneficiary found.
 *
 * @example
 *   extractBeneficiaryFromVendorName("Beneficiar: Ion Popescu, Banca: Maib")
 *   // "Ion Popescu"
 *
 *   extractBeneficiaryFromVendorName("BC Moldindconbank S.A.")
 *   // null
 */
export function extractBeneficiaryFromVendorName(vendorName: string | null): string | null {
  if (!vendorName) return null;
  // Try "Beneficiar: <name>" or "Beneficiary: <name>" patterns
  const m = vendorName.match(/Beneficiar(?:y)?:\s*([^,;\n]+)/i);
  if (m) return m[1].trim();
  return null;
}
