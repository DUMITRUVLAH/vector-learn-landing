/**
 * SCHOOL-002 — Teste pentru gradebook (funcții pure)
 *
 * T-SCHOOL-002-2: weightedAverage cu 3 note ponderate diferit
 * T-SCHOOL-002-7: weightedAverage cu toate null → null
 * T-SCHOOL-002-3: weightedAverage cu weight [2,1,1]
 */
import { describe, it, expect } from "vitest";
import { weightedAverage, termSummary, buildReportCardData } from "../../../server/lib/gradebook";

describe("weightedAverage", () => {
  it("[T-SCHOOL-002-7] returns null when all grades are null", () => {
    const result = weightedAverage([
      { value: null, weight: 1 },
      { value: null, weight: 2 },
    ]);
    expect(result).toBeNull();
  });

  it("[T-SCHOOL-002-7] returns null for empty array", () => {
    expect(weightedAverage([])).toBeNull();
  });

  it("[T-SCHOOL-002-3] computes weighted average correctly: weights [2,1,1], scores [9,7,8] → 8.25", () => {
    const result = weightedAverage([
      { value: 9, weight: 2 },
      { value: 7, weight: 1 },
      { value: 8, weight: 1 },
    ]);
    // (9*2 + 7*1 + 8*1) / (2+1+1) = 33/4 = 8.25
    expect(result).toBe(8.25);
  });

  it("[T-SCHOOL-002-2] two entries with equal weight: (8+10)/2 = 9", () => {
    const result = weightedAverage([
      { value: 8, weight: 1 },
      { value: 10, weight: 1 },
    ]);
    expect(result).toBe(9);
  });

  it("ignores null values in mixed array", () => {
    const result = weightedAverage([
      { value: 8, weight: 1 },
      { value: null, weight: 1 },
      { value: 10, weight: 1 },
    ]);
    expect(result).toBe(9);
  });

  it("rounds to 2 decimal places", () => {
    const result = weightedAverage([
      { value: 8, weight: 2 },
      { value: 10, weight: 1 },
    ]);
    // (16 + 10) / 3 = 8.666... → 8.67
    expect(result).toBe(8.67);
  });

  it("returns null when totalWeight is 0", () => {
    expect(weightedAverage([{ value: 5, weight: 0 }])).toBeNull();
  });
});

describe("termSummary", () => {
  it("groups by subjectId and computes average", () => {
    const entries = [
      { subjectId: "s1", subjectName: "Matematică", value: 8, weight: 1 },
      { subjectId: "s1", subjectName: "Matematică", value: 10, weight: 1 },
      { subjectId: "s2", subjectName: "Română", value: 7, weight: 1 },
    ];
    const result = termSummary(entries);
    expect(result).toHaveLength(2);
    const mat = result.find((r) => r.subjectId === "s1");
    expect(mat?.average).toBe(9);
    expect(mat?.count).toBe(2);
    expect(mat?.min).toBe(8);
    expect(mat?.max).toBe(10);
    const rom = result.find((r) => r.subjectId === "s2");
    expect(rom?.average).toBe(7);
  });

  it("returns average null when all entries for subject are null", () => {
    const entries = [
      { subjectId: "s1", subjectName: "Matematică", value: null, weight: 1 },
    ];
    const result = termSummary(entries);
    expect(result[0].average).toBeNull();
    expect(result[0].count).toBe(0);
  });
});

describe("buildReportCardData", () => {
  it("builds correct report card with overallAverage", () => {
    const result = buildReportCardData({
      studentId: "stu1",
      studentName: "Ion Popescu",
      className: "a V-a A",
      termName: "Semestrul I",
      entries: [
        { subjectId: "s1", subjectName: "Matematică", teacherName: "Prof. X", title: "LS1", value: 9, weight: 1, type: "test", gradedAt: "2026-01-10" },
        { subjectId: "s2", subjectName: "Română", teacherName: "Prof. Y", title: "LS2", value: 7, weight: 1, type: "test", gradedAt: "2026-01-15" },
      ],
    });
    expect(result.studentId).toBe("stu1");
    expect(result.subjects).toHaveLength(2);
    expect(result.overallAverage).toBe(8); // (9+7)/2
  });

  it("returns overallAverage null when no grades", () => {
    const result = buildReportCardData({
      studentId: "stu2",
      studentName: "Maria Ion",
      className: "a VI-a B",
      termName: "Semestrul II",
      entries: [],
    });
    expect(result.subjects).toHaveLength(0);
    expect(result.overallAverage).toBeNull();
  });
});
