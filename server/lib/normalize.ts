export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  if (digits.length === 0) return null;
  // Romanian phone: keep last 9 digits with +40 prefix
  if (digits.length >= 9) {
    return `+40${digits.slice(-9)}`;
  }
  return `+${digits}`;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Normalize a person's name for dedup comparison:
 * - NFC Unicode normalization (canonical form)
 * - Remove diacritics (ă→a, î→i, â→a, ș→s, ț→t, etc.)
 * - Lowercase
 * - Collapse multiple spaces
 * - Trim
 */
export function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const nfc = raw.normalize("NFC");
  // Remove diacritics by decomposing (NFD) then stripping combining marks
  const withoutDiacritics = nfc
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const lower = withoutDiacritics.toLowerCase();
  const collapsed = lower.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}
