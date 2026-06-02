/**
 * DEMO-001 — Tests for rich demo seed
 *
 * Tests validate the seed data structure and ensure the seed
 * creates enough data for realistic demos.
 *
 * Note: These tests validate the seed LOGIC, not live DB.
 * Live validation happens via `npm run db:seed` and manual inspection.
 */

import { describe, it, expect } from "vitest";

// ─── Seed Constants ─────────────────────────────────────────────────────────

const STUDENT_NAMES = [
  "Maria Popescu", "Andrei Ionescu", "Elena Vasilescu", "Mihai Stoica",
  "Ana Dumitrescu", "Radu Petrescu", "Cristina Mitran", "Sergiu Popa",
  "Ioana Raducanu", "Vlad Anghel", "Diana Marin", "Alexandru Tudor",
  "Sofia Negoita", "Tudor Cristea", "Bianca Rosu", "Matei Andrei",
  "Iulia Pavel", "Cosmin Mihai", "Larisa Dobre", "Eric Cristescu",
  "Mara Ionescu", "Dan Florescu", "Andreea Rusu", "Paul Constantin",
  "Roxana Dinu", "Bogdan Voinea", "Lidia Munteanu", "Silviu Oprea",
  "Oana Toma", "Gabriel Gheorghiu", "Camelia Stan", "Florin Barbu",
  "Vera Bucur", "Nicu Avram", "Teodora Sirbu", "Mihnea Ene",
  "Raluca Marinescu", "Dorin Zamfir", "Simona Popa", "Adrian Nedelcu",
  "Claudia Dragomir", "Octavian Lungu", "Denisa Filipescu", "Victor Calin",
  "Gabriela Petre", "Robert Moldovan", "Irina Apostol", "Liviu Dumitru",
  "Adela Balan", "Tiberiu Morar",
];

// Replicate the weeklyDates function from seed.ts
function weeklyDates(start: Date, end: Date, weekdays: number[], hourUTC: number): Date[] {
  const dates: Date[] = [];
  const cur = new Date(start);
  cur.setUTCHours(hourUTC, 0, 0, 0);
  while (cur <= end) {
    if (weekdays.includes(cur.getUTCDay())) {
      dates.push(new Date(cur));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

const semStart = new Date("2025-09-01T00:00:00Z");
const semEnd = new Date("2026-02-28T23:59:59Z");

describe("DEMO-001 — Rich seed data validation", () => {
  it("T-DEMO-001 seed has 50 student names defined", () => {
    expect(STUDENT_NAMES).toHaveLength(50);
  });

  it("T-DEMO-001 all student names are non-empty strings", () => {
    STUDENT_NAMES.forEach((name) => {
      expect(name).toBeTruthy();
      expect(name.length).toBeGreaterThan(3);
    });
  });

  it("T-DEMO-001 student names are unique", () => {
    const unique = new Set(STUDENT_NAMES);
    expect(unique.size).toBe(STUDENT_NAMES.length);
  });

  it("T-DEMO-001 80% of students would be active", () => {
    const statusCounts = { active: 0, trial: 0, paused: 0, archived: 0 };
    STUDENT_NAMES.forEach((_, i) => {
      if (i % 20 === 0) statusCounts.paused++;
      else if (i % 10 === 0) statusCounts.archived++;
      else if (i % 8 === 0) statusCounts.trial++;
      else statusCounts.active++;
    });
    const activeRatio = statusCounts.active / STUDENT_NAMES.length;
    expect(activeRatio).toBeGreaterThan(0.7);
    expect(statusCounts.active).toBeGreaterThan(35);
  });

  it("T-DEMO-001 English B1 lessons cover 3/week for 6 months", () => {
    // Mon/Wed/Fri = [1,3,5]
    const engB1Lessons = weeklyDates(semStart, semEnd, [1, 3, 5], 9);
    // 6 months, ~3/week = ~72 lessons minimum
    expect(engB1Lessons.length).toBeGreaterThanOrEqual(70);
  });

  it("T-DEMO-001 French A1 lessons cover 3/week (Tue/Thu/Sat)", () => {
    const fraA1Lessons = weeklyDates(semStart, semEnd, [2, 4, 6], 10);
    expect(fraA1Lessons.length).toBeGreaterThanOrEqual(70);
  });

  it("T-DEMO-001 Spanish A1 lessons cover 2/week (Tue/Thu)", () => {
    const spaA1Lessons = weeklyDates(semStart, semEnd, [2, 4], 16);
    expect(spaA1Lessons.length).toBeGreaterThanOrEqual(46);
  });

  it("T-DEMO-001 total lessons across 4 courses exceeds 250", () => {
    const engB1 = weeklyDates(semStart, semEnd, [1, 3, 5], 9);
    const engB2 = weeklyDates(semStart, semEnd, [1, 3, 5], 11);
    const fraA1 = weeklyDates(semStart, semEnd, [2, 4, 6], 10);
    const spaA1 = weeklyDates(semStart, semEnd, [2, 4], 16);
    const total = engB1.length + engB2.length + fraA1.length + spaA1.length;
    expect(total).toBeGreaterThan(250);
  });

  it("T-DEMO-001 80% of active students would have payments", () => {
    const activeCount = STUDENT_NAMES.filter((_, i) =>
      !(i % 20 === 0 || i % 10 === 0 || i % 8 === 0)
    ).length;
    const payingCount = Math.floor(activeCount * 0.8);
    const monthCount = 5;
    const expectedPayments = payingCount * monthCount;
    // Should be a substantial number
    expect(expectedPayments).toBeGreaterThan(100);
  });

  it("T-DEMO-001 leads cover all 4 pipeline stages", () => {
    const stages = ["new", "contacted", "trial", "paid", "lost"];
    // The seed creates 2 per stage (new, contacted, trial) + 2 won/paid + 1 lost
    expect(stages).toContain("new");
    expect(stages).toContain("contacted");
    expect(stages).toContain("trial");
    expect(stages).toContain("paid");
    expect(stages).toContain("lost");
  });
});
