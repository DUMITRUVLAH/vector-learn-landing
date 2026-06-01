/**
 * CX-701 — Client-side mirror of server/lib/cohortDates.ts
 * Pure functions for cohort calendar math — no imports, no side effects.
 * Keep in sync with the server version.
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

export function calculateCohortEndDate(
  startDateISO: string,
  totalHours: number,
  hoursPerSession: number,
  scheduleDays: string[] | null | undefined
): Date {
  if (!scheduleDays || scheduleDays.length === 0) {
    const d = new Date(startDateISO);
    d.setUTCDate(d.getUTCDate() + 56);
    return d;
  }

  const totalSessions = Math.ceil(totalHours / hoursPerSession);
  const dayIndices = new Set(scheduleDays.map((name) => DAY_INDEX[name]).filter((n) => n !== undefined));

  let current = new Date(startDateISO);
  let sessionsLeft = totalSessions;

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
  progressPercent: number;
  daysRemaining: number;
  daysUntilStart: number;
  isCompleted: boolean;
  isUpcoming: boolean;
  isActive: boolean;
}

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

  return { progressPercent, daysRemaining, daysUntilStart, isCompleted, isUpcoming, isActive };
}

export function classifyCohort(
  startDateISO: string,
  todayISO?: string
): "active" | "upcoming" | "past" {
  const today = new Date(todayISO ?? new Date().toISOString().slice(0, 10));
  const start = new Date(startDateISO);

  const currentMonthNum = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const startMonthNum = start.getUTCFullYear() * 12 + start.getUTCMonth();

  if (startMonthNum < currentMonthNum) return "past";
  if (startMonthNum <= currentMonthNum + 1) return "active";
  return "upcoming";
}
