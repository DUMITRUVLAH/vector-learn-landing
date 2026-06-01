/**
 * GAP-002 — Potrivire automată grupă
 * T-GAP-002-1: scoring — slot exact match scores highest
 * T-GAP-002-2: no preferred days → base score applies
 * T-GAP-002-3: lead with no interest course → returns all courses (no filter)
 */
import { describe, it, expect } from "vitest";

// Unit tests for the scoring logic extracted from courses route
// Tests the scoring algorithm independently of the DB

interface MockCourse {
  id: string;
  name: string;
  level: string | null;
}

interface MockLesson {
  courseId: string;
  scheduledAt: Date;
  enrolled: number;
}

function scoreMatch(
  course: MockCourse,
  nextLesson: MockLesson | undefined,
  interestCourse: string,
  preferredDays: number[],
  preferredStart: string | null,
  preferredEnd: string | null
): number {
  let score = 0;

  // Interest filter
  if (interestCourse && !course.name.toLowerCase().includes(interestCourse.toLowerCase())) {
    return -1; // excluded
  }

  // Level match
  if (course.level && interestCourse) score += 2;

  if (nextLesson) {
    const jsDay = nextLesson.scheduledAt.getDay();
    const isoDay = jsDay === 0 ? 7 : jsDay;

    if (preferredDays.length > 0 && preferredDays.includes(isoDay)) score += 2;

    if (preferredStart && preferredEnd) {
      const h = String(nextLesson.scheduledAt.getHours()).padStart(2, "0");
      const m = String(nextLesson.scheduledAt.getMinutes()).padStart(2, "0");
      const time = `${h}:${m}`;
      if (time >= preferredStart && time <= preferredEnd) score += 3;
    }
  }

  return score;
}

describe("GAP-002 — course matching scoring", () => {
  const engCourse: MockCourse = { id: "c1", name: "Engleză B2", level: "B2" };
  const mathCourse: MockCourse = { id: "c2", name: "Matematică", level: null };

  it("T-GAP-002-1: exact slot match scores highest (7 points)", () => {
    // Tuesday (isoDay=2) at 17:00
    const tuesday17 = new Date("2026-06-02T17:00:00"); // 2026-06-02 is a Tuesday
    const lesson: MockLesson = { courseId: "c1", scheduledAt: tuesday17, enrolled: 5 };
    const score = scoreMatch(engCourse, lesson, "engleză", [2, 4], "17:00", "19:00");
    // level(+2) + day(+2) + time(+3) = 7
    expect(score).toBe(7);
  });

  it("T-GAP-002-1: day match but no time match scores 4", () => {
    const tuesday10 = new Date("2026-06-02T10:00:00"); // Tuesday but at 10:00
    const lesson: MockLesson = { courseId: "c1", scheduledAt: tuesday10, enrolled: 5 };
    const score = scoreMatch(engCourse, lesson, "engleză", [2, 4], "17:00", "19:00");
    // level(+2) + day(+2) = 4
    expect(score).toBe(4);
  });

  it("T-GAP-002-2: no preferred days → only level match (2 points)", () => {
    const tuesday17 = new Date("2026-06-02T17:00:00");
    const lesson: MockLesson = { courseId: "c1", scheduledAt: tuesday17, enrolled: 5 };
    const score = scoreMatch(engCourse, lesson, "engleză", [], null, null);
    // level(+2) only
    expect(score).toBe(2);
  });

  it("T-GAP-002-3: interest mismatch → excluded (score -1)", () => {
    const score = scoreMatch(mathCourse, undefined, "engleză", [2], "17:00", "19:00");
    expect(score).toBe(-1);
  });

  it("T-GAP-002-3: no interest course → all courses pass filter", () => {
    const score = scoreMatch(mathCourse, undefined, "", [2], "17:00", "19:00");
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("T-GAP-002-1: no upcoming lesson → only level match", () => {
    const score = scoreMatch(engCourse, undefined, "engleză", [2, 4], "17:00", "19:00");
    // level(+2) but no lesson → no day/slot bonus
    expect(score).toBe(2);
  });
});
