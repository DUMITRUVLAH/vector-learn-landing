/**
 * CRM — valoarea unui câmp personalizat, validată după tipul câmpului.
 *
 * Pur (fără bază), ca regula să se poată testa direct și refolosi de orice cale care scrie valori
 * (PUT /api/crm/custom-fields/values azi; un import de leaduri mâine).
 */

export type FieldValueCheck = { ok: true; value: string } | { ok: false; error: "invalid_number" | "invalid_option" };

/**
 * Validează (și normalizează) o valoare nevidă după tipul câmpului.
 * - number: acceptă „1500", „-3", „1 500,5" (virgula zecimală și spațiile de mii, cum scrie un
 *   om din Moldova/România) și o salvează în forma canonică „1500.5" — ca filtrele și rapoartele
 *   s-o poată citi cu `Number()` fără să ghicească formatul. Un număr ca „1,500.5" (mii cu
 *   virgulă) e ambiguu și se refuză, nu se ghicește.
 * - select: doar una dintre opțiunile definite (potrivire exactă); fără opțiuni, nimic nu e valid.
 * - text: orice.
 */
export function normalizeFieldValue(
  field: { type: string; options: string[] | null },
  raw: string
): FieldValueCheck {
  if (field.type === "number") {
    const compact = raw.replace(/[\s\u00a0]/g, "").replace(",", ".");
    if (!/^[-+]?\d+(\.\d+)?$/.test(compact)) return { ok: false, error: "invalid_number" };
    // Păstrăm cifrele așa cum au fost scrise (fără `String(Number(...))`): un număr lung de
    // contract ar pierde precizie trecând prin double.
    return { ok: true, value: compact.replace(/^\+/, "") };
  }
  if (field.type === "select") {
    const options = Array.isArray(field.options) ? field.options : [];
    return options.includes(raw) ? { ok: true, value: raw } : { ok: false, error: "invalid_option" };
  }
  return { ok: true, value: raw };
}
