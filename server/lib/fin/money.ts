/**
 * Pure money-string parsing — no AI/db imports, safe to use from the pure matcher.
 */

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
