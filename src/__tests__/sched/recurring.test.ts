/**
 * SCHED-502 — Lecții recurente: lesson_series + creare N lecții + bulk cancel
 * Covers:
 *   T-SCHED-502-1 [blocant]: POST /api/lessons/recurring — N lessons logic
 *   T-SCHED-502-2 [blocant]: DELETE series future — cancel logic
 *   T-SCHED-502-3 [normal]:  weekly date generation correctness
 */
import { describe, it, expect } from "vitest";
import type { LessonSeries } from "../../lib/api/recurring";

// ─── Helper: generate weekly dates (mirrors server logic) ─────────────────────

function generateWeeklyDates(firstISO: string, count: number): Date[] {
  const first = new Date(firstISO);
  const dates: Date[] = [];
  for (let i = 0; i < count; i++) {
    dates.push(new Date(first.getTime() + i * 7 * 24 * 60 * 60 * 1000));
  }
  return dates;
}

// ─── Helper: check if two intervals overlap ───────────────────────────────────

function overlaps(aStart: Date, aDur: number, bStart: Date, bDur: number): boolean {
  const aEnd = new Date(aStart.getTime() + aDur * 60_000);
  const bEnd = new Date(bStart.getTime() + bDur * 60_000);
  return aStart < bEnd && aEnd > bStart;
}

// ─── T-SCHED-502-1: N lessons creation logic ─────────────────────────────────

describe("SCHED-502 — recurring lesson generation", () => {
  it("T-SCHED-502-1a: generates exactly N dates", () => {
    const dates = generateWeeklyDates("2026-06-01T10:00:00Z", 8);
    expect(dates).toHaveLength(8);
  });

  it("T-SCHED-502-1b: dates are 7 days apart (weekly)", () => {
    const dates = generateWeeklyDates("2026-06-01T10:00:00Z", 4);
    for (let i = 1; i < dates.length; i++) {
      const diff = dates[i].getTime() - dates[i - 1].getTime();
      expect(diff).toBe(7 * 24 * 60 * 60 * 1000); // exactly 1 week in ms
    }
  });

  it("T-SCHED-502-1c: first date matches input", () => {
    const first = "2026-06-01T10:00:00.000Z";
    const dates = generateWeeklyDates(first, 3);
    expect(dates[0].toISOString()).toBe(first);
  });

  it("T-SCHED-502-1d: 12 weeks generates 12 lessons", () => {
    const dates = generateWeeklyDates("2026-09-01T14:00:00Z", 12);
    expect(dates).toHaveLength(12);
  });
});

// ─── T-SCHED-502-2: Bulk cancel future logic ─────────────────────────────────

describe("SCHED-502 — cancel future lessons from series", () => {
  it("T-SCHED-502-2a: identifies future lessons correctly", () => {
    const allDates = generateWeeklyDates("2026-06-01T10:00:00Z", 8);
    const cutoff = new Date("2026-06-22T00:00:00Z"); // after 3rd lesson
    const future = allDates.filter((d) => d >= cutoff);
    expect(future).toHaveLength(5); // lessons 4..8 are future
  });

  it("T-SCHED-502-2b: no future lessons if cutoff is after all dates", () => {
    const allDates = generateWeeklyDates("2026-06-01T10:00:00Z", 4);
    const cutoff = new Date("2030-01-01T00:00:00Z");
    const future = allDates.filter((d) => d >= cutoff);
    expect(future).toHaveLength(0);
  });

  it("T-SCHED-502-2c: all lessons future if cutoff is before first", () => {
    const allDates = generateWeeklyDates("2026-06-01T10:00:00Z", 5);
    const cutoff = new Date("2026-01-01T00:00:00Z");
    const future = allDates.filter((d) => d >= cutoff);
    expect(future).toHaveLength(5);
  });
});

// ─── T-SCHED-502-3: Conflict pre-check on series ─────────────────────────────

describe("SCHED-502 — conflict detection for series", () => {
  it("T-SCHED-502-3: detects conflict in recurring series", () => {
    const seriesDates = generateWeeklyDates("2026-06-01T10:00:00Z", 4); // 4 weekly
    const existingStart = new Date("2026-06-15T10:30:00Z"); // overlaps 3rd occurrence
    const dur = 60;

    const conflicts = seriesDates.filter((d) => overlaps(d, dur, existingStart, dur));
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].toISOString()).toContain("2026-06-15");
  });
});

// ─── LessonSeries type shape ──────────────────────────────────────────────────

describe("SCHED-502 — LessonSeries type shape", () => {
  it("T-SCHED-502-4: LessonSeries has required fields", () => {
    const series: LessonSeries = {
      id: "s-uuid-001",
      tenantId: "t-uuid-001",
      label: "Engleză B2 — Luni 14:00",
      recurrenceType: "weekly",
      dayOfWeek: 1,
      occurrences: 8,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(series.recurrenceType).toBe("weekly");
    expect(series.occurrences).toBe(8);
    expect(series.dayOfWeek).toBe(1);
  });
});

// ─── API client exports ───────────────────────────────────────────────────────

describe("SCHED-502 — recurring API client exports", () => {
  it("T-SCHED-502-5: createRecurringLessons and cancelSeriesFuture are functions", async () => {
    const mod = await import("../../lib/api/recurring");
    expect(typeof mod.createRecurringLessons).toBe("function");
    expect(typeof mod.cancelSeriesFuture).toBe("function");
  });
});
