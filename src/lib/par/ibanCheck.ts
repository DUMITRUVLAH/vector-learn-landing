/**
 * Client-side defensive Moldova IBAN check.
 *
 * The server (server/lib/par/choosePayee.ts → routeIdAndIban) is the AUTHORITATIVE
 * validator (mod-97). This is only a last-line guard so the form never fills the IBAN
 * field with a value that doesn't even look like an MD IBAN, even if the server slips.
 * Mirrors the inline regex previously used in ParCreateForm — kept in one place now.
 */

/** True if `iban` is a structurally valid Moldova IBAN (MD + 2 check digits + 20 alnum). */
export function isValidMoldovaIBAN(iban: string | null | undefined): boolean {
  if (!iban) return false;
  return /^MD\d{2}[A-Z0-9]{20}$/.test(iban.replace(/\s/g, "").toUpperCase());
}
