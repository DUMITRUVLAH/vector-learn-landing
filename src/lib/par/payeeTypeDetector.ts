/**
 * PAR Feature 1 — Persoană fizică vs juridică auto-detect classifier.
 *
 * Rules (deterministic, no network call):
 *   - If name contains a known company keyword → "juridic"
 *   - Otherwise → "fizic"
 *
 * Caller can always override the result via the UI toggle.
 */

/** Keywords that indicate a company (persoană juridică) in Moldova / Romania. */
// Note: Romanian acronyms like ÎS, ÎI use the Î character — we match them case-sensitively here.
const COMPANY_KEYWORDS_RE = /\b(BC|SA|S\.A\.|SRL|S\.R\.L\.|GmbH|LLC|Ltd|Corp|ONG|AO|PÂ|Banca|Bank|Credit|Asigur|Companiei|Compania|Group|Holdings|Institut|Fundatia|Fundația|Asociatia|Asociația|Asociatiei|Organizatia|Organizația|ANSP|IMSP|CNA|ANP)\b|ÎI|Î\.I\.|ÎS|Î\.S\./;

export type PayeeType = "fizic" | "juridic";

/**
 * Infer payee type from a name string.
 *
 * Returns "juridic" if the name contains a company/bank keyword.
 * Returns "fizic" if the name looks like a person (Prenume Nume).
 * Returns null if the name is empty or too ambiguous.
 */
export function detectPayeeType(name: string): PayeeType | null {
  const trimmed = name.trim();
  if (!trimmed) return null;

  // Company keyword match → juridic
  if (COMPANY_KEYWORDS_RE.test(trimmed)) return "juridic";

  // A person-like name: 2+ words of capitalized letters (no numbers, no special corp chars).
  // e.g. "Ion Popescu", "Maria-Elena Ionescu", "Ana-Maria Preda"
  // Each word: starts with uppercase, rest lowercase (may contain hyphen or apostrophe).
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (
    words.length >= 2 &&
    words.every((w) => /^[A-ZĂÂÎȘȚÉÈÇÖÜÄ][a-zA-ZăâîșțéèçöüÄÖÜ\-']*$/.test(w)) &&
    words.every((w) => /^[A-ZĂÂÎȘȚÉÈÇÖÜÄ]/.test(w))
  ) {
    return "fizic";
  }

  // Default → null (user should choose manually)
  return null;
}
