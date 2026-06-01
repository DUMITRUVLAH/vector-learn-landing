/**
 * SCHOOL-003 — Funcții pure pentru calculul prezenței
 */
import type { AttendanceRecord } from "../db/schema";

type StatusOnly = Pick<AttendanceRecord, "status">;

/**
 * Procentul de prezență (present + late = "a venit, poate cu întârziere").
 * Returns null dacă lista e goală (nu împărțim la 0).
 */
export function attendanceRate(records: StatusOnly[]): number | null {
  if (records.length === 0) return null;
  const attended = records.filter(
    (r) => r.status === "present" || r.status === "late"
  ).length;
  return Math.round((attended / records.length) * 100);
}

/**
 * Numără recordurile cu un status specific.
 */
export function absenceCount(records: StatusOnly[], status: AttendanceRecord["status"]): number {
  return records.filter((r) => r.status === status).length;
}
