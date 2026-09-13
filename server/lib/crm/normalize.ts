/**
 * CRM Faza 1 — normalizare telefon/email pentru dedup și căutare pe lead-uri.
 *
 * De ce un normalizator propriu și nu `server/lib/normalize.ts::normalizePhone`: acela produce
 * un format E.164 cu prefix "+40" (gândit pentru alte fluxuri din aplicație), care ar strica
 * dedup-ul lead-urilor introduse cu prefixe de țară diferite (+373 Moldova, +40 România etc.).
 * Aici cerința e simplă și stabilă indiferent de prefix: ultimele 8 cifre — două numere care
 * diferă doar prin prefixul de țară/operator tot ajung la același `phoneNormalized`.
 */

/** Ultimele 8 cifre ale telefonului (ignoră orice separator/prefix). `null` dacă nu sunt cifre. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length === 0) return null;
  return digits.slice(-8);
}

/** Email normalizat: trim + lowercase. `null` dacă rezultă gol. */
export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}
