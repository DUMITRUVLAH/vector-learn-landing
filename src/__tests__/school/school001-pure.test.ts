/**
 * SCHOOL-001 — Unit tests for pure business logic (server/lib/schoolYear.ts)
 *
 * T-SCHOOL-001-5: getCurrentTerm returns correct term for a given date.
 * Additional: classDisplayName, enrollmentCount, seatsRemaining.
 */
import { describe, it, expect } from "vitest";
import {
  getCurrentTerm,
  classDisplayName,
  enrollmentCount,
  seatsRemaining,
} from "../../../server/lib/schoolYear";

const SEM1 = {
  id: "term-1",
  name: "Semestrul I",
  startDate: "2026-09-01",
  endDate: "2027-01-31",
};
const SEM2 = {
  id: "term-2",
  name: "Semestrul II",
  startDate: "2027-02-01",
  endDate: "2027-06-30",
};

// ─── T-SCHOOL-001-5: getCurrentTerm ──────────────────────────────────────────

describe("getCurrentTerm", () => {
  it("[normal] returnează Semestrul I când data cade în primul termen", () => {
    const result = getCurrentTerm([SEM1, SEM2], new Date("2026-11-15"));
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Semestrul I");
  });

  it("[normal] returnează Semestrul II când data cade în al doilea termen", () => {
    const result = getCurrentTerm([SEM1, SEM2], new Date("2027-03-20"));
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Semestrul II");
  });

  it("[normal] returnează null când data nu cade în niciun termen (vacanță)", () => {
    const result = getCurrentTerm([SEM1, SEM2], new Date("2027-07-15"));
    expect(result).toBeNull();
  });

  it("[normal] funcționează inclusiv pe data de start a termenului", () => {
    const result = getCurrentTerm([SEM1], new Date("2026-09-01"));
    expect(result?.name).toBe("Semestrul I");
  });

  it("[normal] funcționează inclusiv pe data de end a termenului", () => {
    const result = getCurrentTerm([SEM1], new Date("2027-01-31"));
    expect(result?.name).toBe("Semestrul I");
  });

  it("[normal] returnează null pentru o listă goală de termene", () => {
    const result = getCurrentTerm([], new Date("2026-10-01"));
    expect(result).toBeNull();
  });
});

// ─── classDisplayName ─────────────────────────────────────────────────────────

describe("classDisplayName", () => {
  it("a V-a A pentru (5, A)", () => {
    expect(classDisplayName("5", "A")).toBe("a V-a A");
  });

  it("a V-a fără secțiune pentru (5, null)", () => {
    expect(classDisplayName("5", null)).toBe("a V-a");
  });

  it("clasa I pentru clasa întâi fără secțiune", () => {
    expect(classDisplayName("1", null)).toBe("clasa I");
  });

  it("clasa II B pentru (2, B)", () => {
    expect(classDisplayName("2", "B")).toBe("clasa II B");
  });

  it("clasa III A pentru (3, A)", () => {
    expect(classDisplayName("3", "A")).toBe("clasa III A");
  });

  it("a IV-a A pentru (4, A)", () => {
    expect(classDisplayName("4", "A")).toBe("a IV-a A");
  });

  it("a XII-a C pentru (12, C)", () => {
    expect(classDisplayName("12", "C")).toBe("a XII-a C");
  });

  it("clasa 13 (nivel necunoscut) afișat literal", () => {
    expect(classDisplayName("13", "A")).toBe("clasa 13 A");
  });
});

// ─── enrollmentCount + seatsRemaining ────────────────────────────────────────

describe("enrollmentCount", () => {
  it("numără doar înscriuții activi", () => {
    const enrollments = [
      { status: "active" as const },
      { status: "withdrawn" as const },
      { status: "active" as const },
      { status: "transferred" as const },
    ];
    expect(enrollmentCount(enrollments)).toBe(2);
  });

  it("returnează 0 pentru lista goală", () => {
    expect(enrollmentCount([])).toBe(0);
  });
});

describe("seatsRemaining", () => {
  it("returnează null când capacity e null (nelimitată)", () => {
    expect(seatsRemaining(null, [{ status: "active" as const }])).toBeNull();
  });

  it("returnează locurile rămase corect", () => {
    const e = [
      { status: "active" as const },
      { status: "active" as const },
    ];
    expect(seatsRemaining(5, e)).toBe(3);
  });

  it("returnează 0 când clasa e plină (nu negativ)", () => {
    const e = Array(5).fill({ status: "active" as const });
    expect(seatsRemaining(5, e)).toBe(0);
  });

  it("returnează 0 și când e depășit (edge case)", () => {
    const e = Array(6).fill({ status: "active" as const });
    expect(seatsRemaining(5, e)).toBe(0);
  });
});
