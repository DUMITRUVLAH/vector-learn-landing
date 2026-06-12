/**
 * PAR-003: IBAN + IDNP validators (reusable across PAR module)
 * CORE: backlog/par/PAR-CORE.md §0.12, §9
 */

/**
 * Validate a Moldova IBAN: starts with MD, exactly 24 chars, mod-97 checksum.
 * Format: MD + 2 check digits + 20 alphanumeric chars (e.g. MD48ML000002259A19498121)
 */
export function isValidMoldovaIBAN(iban: string): boolean {
  const clean = iban.replace(/\s/g, "").toUpperCase();
  if (!/^MD\d{2}[A-Z0-9]{20}$/.test(clean)) return false;
  return isValidIBAN(clean);
}

/**
 * Generic IBAN validation (mod-97 algorithm per ISO 13616).
 * Supports any country code. Moldova-specific format check is in isValidMoldovaIBAN.
 */
export function isValidIBAN(iban: string): boolean {
  const clean = iban.replace(/\s/g, "").toUpperCase();
  if (clean.length < 5) return false;

  // Move first 4 chars to end
  const rearranged = clean.slice(4) + clean.slice(0, 4);

  // Convert letters to numbers: A=10, B=11, ...
  const numeric = rearranged
    .split("")
    .map((c) => {
      const code = c.charCodeAt(0);
      if (code >= 65 && code <= 90) return String(code - 55); // A=10..Z=35
      return c;
    })
    .join("");

  // Mod 97 check
  let remainder = 0;
  for (const char of numeric) {
    remainder = (remainder * 10 + parseInt(char, 10)) % 97;
  }
  return remainder === 1;
}

/**
 * Validate a Moldova IDNP: exactly 13 decimal digits.
 * CORE §0.12: "Moldova personal ID — 13 digits"
 */
export function isValidIDNP(idnp: string): boolean {
  return /^\d{13}$/.test(idnp.trim());
}
