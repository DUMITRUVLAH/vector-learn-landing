/**
 * SCHOOL-001 — Funcții pure pentru modulul de școală
 *
 * Toate funcțiile sunt pure (fără DB) — ușor de testat în vitest.
 */

import type { AcademicTerm, ClassEnrollment } from "../db/schema";

// ─── Termene ─────────────────────────────────────────────────────────────────

/**
 * Întoarce termenul în care cade `date`, sau null dacă nu există.
 * Comparare inclusivă: [startDate, endDate].
 */
export function getCurrentTerm(
  terms: Pick<AcademicTerm, "id" | "startDate" | "endDate" | "name">[],
  date: Date
): Pick<AcademicTerm, "id" | "startDate" | "endDate" | "name"> | null {
  const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD
  for (const term of terms) {
    if (term.startDate <= dateStr && dateStr <= term.endDate) {
      return term;
    }
  }
  return null;
}

// ─── Afișaj clasă ─────────────────────────────────────────────────────────────

/**
 * Construiește numele afișat al clasei.
 *   classDisplayName("5", "A")   → "a V-a A"
 *   classDisplayName("5", null)  → "a V-a"
 *   classDisplayName("1", "B")   → "clasa I B"
 *   classDisplayName("12", "C")  → "a XII-a C"
 *
 * Logica: dacă gradeLevel poate fi convertit în număr roman, afișăm forma
 * clasică românească; altfel lăsăm gradeLevel ca atare.
 */
export function classDisplayName(gradeLevel: string, section: string | null | undefined): string {
  const ROMAN: Record<string, string> = {
    "1": "I",
    "2": "II",
    "3": "III",
    "4": "IV",
    "5": "V",
    "6": "VI",
    "7": "VII",
    "8": "VIII",
    "9": "IX",
    "10": "X",
    "11": "XI",
    "12": "XII",
  };
  const roman = ROMAN[gradeLevel];
  const sectionSuffix = section ? ` ${section}` : "";

  if (!roman) {
    return `clasa ${gradeLevel}${sectionSuffix}`;
  }

  // clasa I, II, III → „clasa I A", „clasa II B"
  // clasa IV→XII → „a IV-a A", „a XII-a B"
  const noArticle = ["I", "II", "III"].includes(roman);
  if (noArticle) {
    return `clasa ${roman}${sectionSuffix}`;
  }
  return `a ${roman}-a${sectionSuffix}`;
}

// ─── Capacitate ───────────────────────────────────────────────────────────────

/**
 * Numără înscriuții activi (status = „active").
 */
export function enrollmentCount(
  enrollments: Pick<ClassEnrollment, "status">[]
): number {
  return enrollments.filter((e) => e.status === "active").length;
}

/**
 * Întoarce locurile rămase. Null dacă capacity e null (nelimitat).
 * 0 dacă plin sau depășit.
 */
export function seatsRemaining(
  capacity: number | null | undefined,
  enrollments: Pick<ClassEnrollment, "status">[]
): number | null {
  if (capacity == null) return null;
  return Math.max(0, capacity - enrollmentCount(enrollments));
}
