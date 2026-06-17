/**
 * Pure helpers — no AI/db imports, safe to use from the pure matcher and route handlers.
 */

/**
 * Strip characters a Postgres `text` column rejects (NUL 0x00) or that are noise (C0 control
 * chars), keeping \n and \t. PDF text layers frequently contain 0x00 → storing it raises
 * "invalid byte sequence for encoding UTF8: 0x00", which 500'd the capture upload.
 */
export function sanitizePgText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u0000/g, "").replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
}

/**
 * Parse a money string into a number, handling BOTH formats robustly:
 *   - European "3.128,50" (dot=thousands, comma=decimal) → 3128.50
 *   - Plain/US "3128.50" or "3,128.50" (dot=decimal) → 3128.50
 * The decimal separator is whichever of "." / "," appears LAST; the other is thousands.
 */
export function parseAmount(raw: string): number {
  const s = raw.trim();
  if (!s) return NaN;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot === -1 && lastComma === -1) {
    normalized = s;
  } else if (lastComma > lastDot) {
    // comma is the decimal separator → drop dots (thousands), comma → dot
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    // dot is the decimal separator → drop commas (thousands)
    normalized = s.replace(/,/g, "");
  }
  return parseFloat(normalized);
}
