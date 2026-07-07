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

// ── TB-003: grila lunară pentru view-ul Calendar ─────────────────────────────

export interface MonthGridCell {
  /** Data celulei, ISO "YYYY-MM-DD". */
  iso: string;
  /** Ziua din lună (1–31) — pt. randare. */
  day: number;
  /** True dacă celula aparține lunii afișate (nu lunilor vecine de umplutură). */
  inMonth: boolean;
}

/**
 * Grila 6×7 (42 celule) a unei luni, cu săptămâna începând LUNI (convenția ro-RO).
 * `month` e 1-based (1 = ianuarie). Celulele din lunile vecine au inMonth=false.
 */
export function buildMonthGrid(year: number, month: number): MonthGridCell[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // getUTCDay(): 0=duminică … 6=sâmbătă → offset față de luni (0=luni … 6=duminică).
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const cells: MonthGridCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(year, month - 1, 1 - mondayOffset + i));
    cells.push({
      iso: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month - 1,
    });
  }
  return cells;
}

/** Titlul lunii în română: (2026, 9) → "septembrie 2026". */
export function monthLabelRo(year: number, month: number): string {
  return new Intl.DateTimeFormat("ro-RO", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1)
  );
}

/** Luna anterioară/următoare ca [an, lună 1-based]. */
export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return [d.getUTCFullYear(), d.getUTCMonth() + 1];
}
