/**
 * CX-701 — Pure business functions for cohort calendar math.
 * Ported 1:1 from copy-roas/src/hooks/useCXData.ts — no side-effects, no DB calls.
 * Uses only the standard Date API (no date-fns dependency in this module).
 */

/**
 * Day-of-week map: English full name → 0 (Sunday) … 6 (Saturday)
 * (matches JS Date.getDay())
 */
const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/**
 * Calculate the end date of a cohort based on its schedule.
 *
 * Algorithm (matches copy-roas `calculateCourseEndDate`):
 *   totalSessions = ceil(totalHours / hoursPerSession)
 *   Walk forward day-by-day from startDate; count only days whose weekday
 *   is in scheduleDays; stop when totalSessions is reached.
 *
 * Fallback: if scheduleDays is empty/null → return startDate + 56 days.
 *
 * @param startDateISO  "YYYY-MM-DD"
 * @param totalHours    e.g. 32
 * @param hoursPerSession  e.g. 2
 * @param scheduleDays  e.g. ["Tuesday","Thursday"] (English day names)
 * @returns Date representing the last day of the cohort
 */
export function calculateCohortEndDate(
  startDateISO: string,
  totalHours: number,
  hoursPerSession: number,
  scheduleDays: string[] | null | undefined
): Date {
  // Fallback: no schedule → 8 weeks from start
  if (!scheduleDays || scheduleDays.length === 0) {
    const d = new Date(startDateISO);
    d.setUTCDate(d.getUTCDate() + 56);
    return d;
  }

  const totalSessions = Math.ceil(totalHours / hoursPerSession);
  const dayIndices = new Set(scheduleDays.map((name) => DAY_INDEX[name]).filter((n) => n !== undefined));

  let current = new Date(startDateISO);
  let sessionsLeft = totalSessions;

  // Walk until we've counted enough session days.
  // The loop starts from startDate and includes it if it's a schedule day.
  while (sessionsLeft > 0) {
    const dayOfWeek = current.getUTCDay();
    if (dayIndices.has(dayOfWeek)) {
      sessionsLeft -= 1;
    }
    if (sessionsLeft > 0) {
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  return current;
}

export interface CohortProgress {
  /** 0–100 clamped */
  progressPercent: number;
  /** Negative when cohort is in future */
  daysRemaining: number;
  /** Positive when cohort hasn't started yet */
  daysUntilStart: number;
  isCompleted: boolean;
  isUpcoming: boolean;
  isActive: boolean;
}

/**
 * Calculate progress state for a cohort given today's date.
 * Matches copy-roas `calculateCourseProgress`.
 *
 * @param startDateISO "YYYY-MM-DD"
 * @param endDateISO   "YYYY-MM-DD"
 * @param todayISO     "YYYY-MM-DD" (defaults to today in UTC)
 */
export function calculateCohortProgress(
  startDateISO: string,
  endDateISO: string,
  todayISO?: string
): CohortProgress {
  const today = new Date(todayISO ?? new Date().toISOString().slice(0, 10));
  const start = new Date(startDateISO);
  const end = new Date(endDateISO);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const totalDays = Math.max((end.getTime() - start.getTime()) / MS_PER_DAY, 1);
  const daysPassed = (today.getTime() - start.getTime()) / MS_PER_DAY;

  const rawPercent = (daysPassed / totalDays) * 100;
  const progressPercent = Math.min(100, Math.max(0, Math.round(rawPercent)));

  const daysRemaining = Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);
  const daysUntilStart = Math.round((start.getTime() - today.getTime()) / MS_PER_DAY);

  const isCompleted = today >= end;
  const isUpcoming = today < start;
  const isActive = !isCompleted && !isUpcoming;

  return {
    progressPercent,
    daysRemaining,
    daysUntilStart,
    isCompleted,
    isUpcoming,
    isActive,
  };
}

/**
 * Classify a cohort as active / upcoming / past.
 *
 * Rules (from copy-roas grouping logic):
 *   - "active"   → start is in current month OR next month
 *   - "upcoming" → start is after next month
 *   - "past"     → start is before current month
 *
 * @param startDateISO "YYYY-MM-DD"
 * @param todayISO     "YYYY-MM-DD" (defaults to today in UTC)
 */
export function classifyCohort(
  startDateISO: string,
  todayISO?: string
): "active" | "upcoming" | "past" {
  const today = new Date(todayISO ?? new Date().toISOString().slice(0, 10));
  const start = new Date(startDateISO);

  const todayYear = today.getUTCFullYear();
  const todayMonth = today.getUTCMonth(); // 0-based

  const startYear = start.getUTCFullYear();
  const startMonth = start.getUTCMonth(); // 0-based

  // Months are ints: currentMonthNum and nextMonthNum (may spill to next year)
  const currentMonthNum = todayYear * 12 + todayMonth;
  const startMonthNum = startYear * 12 + startMonth;

  if (startMonthNum < currentMonthNum) return "past";
  if (startMonthNum <= currentMonthNum + 1) return "active";
  return "upcoming";
}
