/**
 * DIPLOMA-801 — Certificate ID builder (client-side copy)
 *
 * Pure function, no server dependencies. Shared via this module
 * so client tests can import it under the @/* alias.
 *
 * Server version at server/lib/certificateId.ts re-exports from here.
 *
 * Format: {prefix}{edition}-{year}VA-{n}
 *   prefix  = first 6 letters of courseName, uppercased, no spaces
 *   edition = the edition string (e.g. "Mai2026") — omitted if null/"default"
 *   year    = 4-digit year (default: current year)
 *   n       = index + 1 (1-based)
 *   VA      = configurable tenant suffix (default "VA")
 */

/**
 * Build the course name prefix: first 6 chars uppercased, spaces stripped.
 */
export function buildCoursePrefix(courseName: string): string {
  return courseName.replace(/\s+/g, "").toUpperCase().slice(0, 6);
}

/**
 * Returns true if the edition string is considered "absent"
 * (null, empty, or the literal string "default").
 */
function isEditionAbsent(edition: string | null | undefined): boolean {
  if (!edition) return true;
  return edition.trim().toLowerCase() === "default";
}

/**
 * Build a certificate ID string.
 *
 * @param tenantSuffix - Tenant-specific suffix replacing "VA" (e.g. "VA", "MD", "RO")
 * @param courseName   - Full course name (e.g. "Facebook Ads")
 * @param edition      - Edition label (e.g. "Mai2026") or null/"default" for no-edition format
 * @param index        - 0-based index within this cohort/batch (displayed as index+1)
 * @param year         - Optional year override (defaults to current year)
 */
export function buildCertificateId(
  tenantSuffix: string,
  courseName: string,
  edition: string | null | undefined,
  index: number,
  year?: number
): string {
  const prefix = buildCoursePrefix(courseName);
  const yearStr = String(year ?? new Date().getFullYear());
  const n = index + 1;

  if (isEditionAbsent(edition)) {
    return `${prefix}-${yearStr}${tenantSuffix}-${n}`;
  }

  return `${prefix}${edition}-${yearStr}${tenantSuffix}-${n}`;
}
