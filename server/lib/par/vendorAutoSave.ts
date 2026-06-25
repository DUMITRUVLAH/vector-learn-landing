/**
 * VM1-05 — pure helpers for auto-saving the payee into the vendor registry on payment.
 * Kept pure (no DB) so the dedup + normalization logic is unit-testable.
 */

/** Normalize an IBAN for comparison: strip all whitespace, uppercase. */
export function normIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Find an existing vendor whose IBAN matches `iban` (ignoring spaces/case).
 * Returns the matching vendor or undefined. Vendors without an IBAN are ignored.
 */
export function findVendorByIban<T extends { iban?: string | null }>(
  vendors: readonly T[],
  iban: string
): T | undefined {
  const target = normIban(iban);
  if (!target) return undefined;
  return vendors.find((v) => !!v.iban && normIban(v.iban) === target);
}

/**
 * Whether a paid PAR's payee should be remembered in the registry.
 * Only inline payees (no vendorId) that carry an IBAN are worth saving —
 * the IBAN is the thing reused next time.
 */
export function shouldAutoSaveVendor(par: {
  vendorId?: string | null;
  payeeIban?: string | null;
}): boolean {
  return !par.vendorId && !!par.payeeIban && par.payeeIban.trim().length > 0;
}
