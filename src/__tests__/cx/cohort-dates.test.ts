/**
 * CX-701 — Cohort date calculation tests
 *
 * T-CX-701-1 [blocant]: calculateCohortEndDate(2026-05-04, 32, 2, [Tuesday,Thursday])
 *   → 16 sessions, correct end date
 * T-CX-701-2 [blocant]: no scheduleDays → end = start + 56 days
 * T-CX-701-3 [normal]:  calculateCohortProgress clamp 0..100 + flags
 * T-CX-701-4 [normal]:  classifyCohort returns correct category
 */
import { describe, it, expect } from "vitest";
import {
  calculateCohortEndDate,
  calculateCohortProgress,
  classifyCohort,
} from "../../lib/cohortDates";

// ─── T-CX-701-1 — End date with scheduleDays ─────────────────────────────────

describe("calculateCohortEndDate", () => {
  it("T-CX-701-1 [blocant]: 32h / 2h/session, [Tuesday,Thursday], start 2026-05-04 → 16 sessions", () => {
    // 2026-05-04 is a Monday.
    // First session day: Tuesday 2026-05-05, second: Thursday 2026-05-07 … week 1 = 2 sessions
    // 16 sessions across 8 weeks of Tue+Thu:
    //   Wk1: May5, May7; Wk2: May12,May14; Wk3: May19,May21; Wk4: May26,May28;
    //   Wk5: Jun2,Jun4;  Wk6: Jun9,Jun11;  Wk7: Jun16,Jun18; Wk8: Jun23,Jun25
    // 16th session = June 25, 2026
    const result = calculateCohortEndDate("2026-05-04", 32, 2, ["Tuesday", "Thursday"]);
    const expected = "2026-06-25";
    expect(result.toISOString().slice(0, 10)).toBe(expected);
  });

  it("T-CX-701-1b: 8h / 2h = 4 sessions, [Monday], start 2026-05-04 → 4 Mondays", () => {
    // May4 (Mon), May11, May18, May25 → end = May25
    const result = calculateCohortEndDate("2026-05-04", 8, 2, ["Monday"]);
    expect(result.toISOString().slice(0, 10)).toBe("2026-05-25");
  });

  it("T-CX-701-1c: 6h / 2h = 3 sessions, [Wednesday,Friday], start 2026-05-06 (Wed)", () => {
    // May6 (Wed) → session1, May8 (Fri) → session2, May13 (Wed) → session3
    const result = calculateCohortEndDate("2026-05-06", 6, 2, ["Wednesday", "Friday"]);
    expect(result.toISOString().slice(0, 10)).toBe("2026-05-13");
  });

  // T-CX-701-2 [blocant]: no scheduleDays → start + 56 days
  it("T-CX-701-2 [blocant]: null scheduleDays → start + 56 days", () => {
    const result = calculateCohortEndDate("2026-05-04", 32, 2, null);
    const start = new Date("2026-05-04");
    start.setUTCDate(start.getUTCDate() + 56);
    expect(result.toISOString().slice(0, 10)).toBe(start.toISOString().slice(0, 10));
  });

  it("T-CX-701-2b: empty scheduleDays → start + 56 days", () => {
    const result = calculateCohortEndDate("2026-05-04", 32, 2, []);
    const start = new Date("2026-05-04");
    start.setUTCDate(start.getUTCDate() + 56);
    expect(result.toISOString().slice(0, 10)).toBe(start.toISOString().slice(0, 10));
  });
});

// ─── T-CX-701-3 — Progress flags and clamp ───────────────────────────────────

describe("calculateCohortProgress", () => {
  it("T-CX-701-3a: upcoming cohort → isUpcoming=true, percent=0, daysUntilStart>0", () => {
    const progress = calculateCohortProgress("2026-08-01", "2026-10-01", "2026-06-01");
    expect(progress.isUpcoming).toBe(true);
    expect(progress.isActive).toBe(false);
    expect(progress.isCompleted).toBe(false);
    expect(progress.progressPercent).toBe(0);
    expect(progress.daysUntilStart).toBeGreaterThan(0);
  });

  it("T-CX-701-3b: completed cohort → isCompleted=true, percent=100", () => {
    const progress = calculateCohortProgress("2025-01-01", "2025-03-01", "2026-06-01");
    expect(progress.isCompleted).toBe(true);
    expect(progress.isActive).toBe(false);
    expect(progress.progressPercent).toBe(100);
  });

  it("T-CX-701-3c: active cohort midway → 0 < percent < 100", () => {
    // Start: 2026-05-01, End: 2026-07-01, Today: 2026-06-01 = 31/61 days ≈ 50%
    const progress = calculateCohortProgress("2026-05-01", "2026-07-01", "2026-06-01");
    expect(progress.isActive).toBe(true);
    expect(progress.progressPercent).toBeGreaterThan(0);
    expect(progress.progressPercent).toBeLessThan(100);
  });

  it("T-CX-701-3d: clamp — progress never negative (pre-start with same-day edge)", () => {
    const progress = calculateCohortProgress("2026-06-01", "2026-09-01", "2026-06-01");
    // today = start, so it might be 0% or just started, not negative
    expect(progress.progressPercent).toBeGreaterThanOrEqual(0);
  });
});

// ─── T-CX-701-4 — classifyCohort ────────────────────────────────────────────

describe("classifyCohort", () => {
  it("T-CX-701-4a: start in current month → active", () => {
    // today = 2026-06-01, start = 2026-06-15 (same month)
    expect(classifyCohort("2026-06-15", "2026-06-01")).toBe("active");
  });

  it("T-CX-701-4b: start in next month → active", () => {
    // today = 2026-06-01, start = 2026-07-01 (next month)
    expect(classifyCohort("2026-07-01", "2026-06-01")).toBe("active");
  });

  it("T-CX-701-4c: start after next month → upcoming", () => {
    // today = 2026-06-01, start = 2026-08-01 (2 months away)
    expect(classifyCohort("2026-08-01", "2026-06-01")).toBe("upcoming");
  });

  it("T-CX-701-4d: start in past month → past", () => {
    // today = 2026-06-01, start = 2026-04-01
    expect(classifyCohort("2026-04-01", "2026-06-01")).toBe("past");
  });
});
