/**
 * TB-001: Helper-e de date pentru TaskBoard — Date nativ + Intl, fără librării
 * (invariant de proiect: nu există date-fns). Datele circulă ca ISO "YYYY-MM-DD".
 */

/** Adaugă n zile (cu semn) la o dată ISO "YYYY-MM-DD" → ISO. UTC-safe (fără DST drift). */
export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Data de azi ca ISO "YYYY-MM-DD" (ora locală). */
export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Termen depășit: are dueDate în trecut și nu e done. Comparația ISO e lexicografică. */
export function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === "done") return false;
  return dueDate < todayIso();
}

/** Formatare scurtă românească: "2026-09-14" → "14 sept. 2026". */
export function formatDateRo(isoDate: string | null): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}
