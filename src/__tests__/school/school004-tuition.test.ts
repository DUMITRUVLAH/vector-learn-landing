/**
 * SCHOOL-004 — Teste pentru funcții pure de taxe școlare
 *
 * T-SCHOOL-004-2: siblingDiscount(1, 10) → 0
 * T-SCHOOL-004-3: siblingDiscount(2, 10) → 10
 * T-SCHOOL-004-4: effectiveAmount(10000, 2, 10, 500, 0) → 8500
 */
import { describe, it, expect } from "vitest";
import { siblingDiscount, effectiveAmount, installmentSchedule } from "../../../server/lib/tuition";

describe("siblingDiscount", () => {
  it("[T-SCHOOL-004-2] returns 0 for rank=1 (first child)", () => {
    expect(siblingDiscount(1, 10)).toBe(0);
  });

  it("[T-SCHOOL-004-3] returns basePercent for rank=2 (second child)", () => {
    expect(siblingDiscount(2, 10)).toBe(10);
  });

  it("returns basePercent*2 for rank=3 (third child)", () => {
    expect(siblingDiscount(3, 10)).toBe(20);
  });

  it("returns basePercent*2 for rank >= 3", () => {
    expect(siblingDiscount(5, 15)).toBe(30);
  });

  it("returns 0 for rank=1 with any basePercent", () => {
    expect(siblingDiscount(1, 50)).toBe(0);
  });
});

describe("effectiveAmount", () => {
  it("[T-SCHOOL-004-4] rank=2, sibling=10%, scholarship=500 cents on 10000 cents → 8500", () => {
    // 10000 * (1 - 0.10) = 9000 - 500 = 8500
    expect(
      effectiveAmount({
        amountCents: 10000,
        siblingRank: 2,
        siblingDiscountPercent: 10,
        scholarshipAmountCents: 500,
        scholarshipPercent: 0,
      })
    ).toBe(8500);
  });

  it("rank=1 no scholarship → same amount", () => {
    expect(
      effectiveAmount({
        amountCents: 5000,
        siblingRank: 1,
        siblingDiscountPercent: 10,
        scholarshipAmountCents: 0,
        scholarshipPercent: 0,
      })
    ).toBe(5000);
  });

  it("combined sibling + scholarship percent", () => {
    // rank=2: sibling=10%, scholarship=20% → total=30%
    // 10000 * (1-0.30) = 7000
    expect(
      effectiveAmount({
        amountCents: 10000,
        siblingRank: 2,
        siblingDiscountPercent: 10,
        scholarshipAmountCents: 0,
        scholarshipPercent: 20,
      })
    ).toBe(7000);
  });

  it("never goes below 0", () => {
    expect(
      effectiveAmount({
        amountCents: 1000,
        siblingRank: 3,
        siblingDiscountPercent: 40,
        scholarshipAmountCents: 5000,
        scholarshipPercent: 0,
      })
    ).toBe(0);
  });
});

describe("installmentSchedule", () => {
  it("splits 1200 into 3 equal installments of 400", () => {
    expect(installmentSchedule(1200, 3)).toEqual([400, 400, 400]);
  });

  it("distributes remainder to last installment", () => {
    // 1000 / 3 = 333.33... → 333, 333, 334
    const result = installmentSchedule(1000, 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(333);
    expect(result[1]).toBe(333);
    expect(result[2]).toBe(334); // absorbs remainder
    expect(result.reduce((s, v) => s + v, 0)).toBe(1000);
  });

  it("returns empty array for count=0", () => {
    expect(installmentSchedule(1000, 0)).toEqual([]);
  });

  it("returns single installment for count=1", () => {
    expect(installmentSchedule(5000, 1)).toEqual([5000]);
  });

  it("sum always equals total", () => {
    const total = 9999;
    const parts = installmentSchedule(total, 7);
    expect(parts.reduce((s, v) => s + v, 0)).toBe(total);
  });
});
