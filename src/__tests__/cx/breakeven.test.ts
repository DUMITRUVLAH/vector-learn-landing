/**
 * CX-705 — cohortBreakeven server-lib tests
 *
 * T-CX-705-1: incasat=1000, expected=1600, costs=1200 → projectedProfit=100; isProfit=true
 * T-CX-705-2: costs > projected revenue → isProfit=false
 * T-CX-705-3: marketing/fixed missing → treated as 0, result valid
 */
import { describe, it, expect } from "vitest";
import { computeCohortBreakeven } from "@/lib/cohortBreakeven";

describe("T-CX-705-1: basic profit scenario", () => {
  it("incasat=100000, expected=160000, costs=120000 → projectedProfit=10000; isProfit=true", () => {
    // All values in cents:
    // incasat=1000 EUR = 100000 cents
    // expected=1600 EUR = 160000 cents
    // costs=1200 EUR = 120000 cents
    // projectedProfit = 100000 + (160000-100000)*0.5 - 120000
    //                 = 100000 + 30000 - 120000 = 10000 cents = 100 EUR
    const result = computeCohortBreakeven({
      incasatCents: 100_000,
      expectedCents: 160_000,
      mentorCostCents: 100_000,
      roomCostCents: 20_000,
      marketingCostCents: 0,
      allocatedFixedCostCents: 0,
    });
    expect(result.projectedProfitCents).toBe(10_000);
    expect(result.isProfit).toBe(true);
    expect(result.totalCostCents).toBe(120_000);
  });

  it("matches the integer spec values (cents as 100× the unit values)", () => {
    // spec: incasat=1000, expected=1600, costuri=1200 → projectedProfit=100
    // treating these as raw unit values (not cents):
    const result = computeCohortBreakeven({
      incasatCents: 1000,
      expectedCents: 1600,
      mentorCostCents: 1200,
      roomCostCents: 0,
      marketingCostCents: 0,
      allocatedFixedCostCents: 0,
    });
    // projectedProfit = 1000 + (1600-1000)*0.5 - 1200 = 1000 + 300 - 1200 = 100
    expect(result.projectedProfitCents).toBe(100);
    expect(result.isProfit).toBe(true);
    expect(result.breakEvenDistanceCents).toBe(0);
  });
});

describe("T-CX-705-2: loss scenario (costs > projected revenue)", () => {
  it("isProfit=false when costs exceed projected", () => {
    // incasat=1000, expected=1200, costs=2000
    // projectedProfit = 1000 + (1200-1000)*0.5 - 2000 = 1000 + 100 - 2000 = -900
    const result = computeCohortBreakeven({
      incasatCents: 1000,
      expectedCents: 1200,
      mentorCostCents: 1500,
      roomCostCents: 500,
      marketingCostCents: 0,
    });
    expect(result.isProfit).toBe(false);
    expect(result.projectedProfitCents).toBe(-900);
    expect(result.breakEvenDistanceCents).toBe(900);
  });

  it("breakEvenDistanceCents equals abs(projectedProfit) when negative", () => {
    const result = computeCohortBreakeven({
      incasatCents: 0,
      expectedCents: 0,
      mentorCostCents: 500,
      roomCostCents: 0,
    });
    expect(result.projectedProfitCents).toBe(-500);
    expect(result.breakEvenDistanceCents).toBe(500);
    expect(result.isProfit).toBe(false);
  });
});

describe("T-CX-705-3: missing marketing/fixed costs → treated as 0", () => {
  it("omitting marketingCostCents gives same result as passing 0", () => {
    const withZero = computeCohortBreakeven({
      incasatCents: 5000,
      expectedCents: 8000,
      mentorCostCents: 3000,
      roomCostCents: 1000,
      marketingCostCents: 0,
      allocatedFixedCostCents: 0,
    });
    const withOmitted = computeCohortBreakeven({
      incasatCents: 5000,
      expectedCents: 8000,
      mentorCostCents: 3000,
      roomCostCents: 1000,
      // marketingCostCents and allocatedFixedCostCents omitted
    });
    expect(withOmitted.projectedProfitCents).toBe(withZero.projectedProfitCents);
    expect(withOmitted.isProfit).toBe(withZero.isProfit);
    expect(withOmitted.totalCostCents).toBe(4000);
  });

  it("does not crash when all optional costs are omitted", () => {
    const result = computeCohortBreakeven({
      incasatCents: 0,
      expectedCents: 0,
      mentorCostCents: 0,
      roomCostCents: 0,
    });
    expect(result.projectedProfitCents).toBe(0);
    expect(result.isProfit).toBe(true);
    expect(result.totalCostCents).toBe(0);
  });
});

describe("formula accuracy", () => {
  it("uses projectedProfit = incasat + (expected-incasat)*0.5 - totalCosts", () => {
    // Known values
    const incasat = 20_000;
    const expected = 30_000;
    const mentorCost = 8_000;
    const roomCost = 2_000;
    const marketing = 1_000;
    // = 20000 + 5000 - 11000 = 14000
    const result = computeCohortBreakeven({
      incasatCents: incasat,
      expectedCents: expected,
      mentorCostCents: mentorCost,
      roomCostCents: roomCost,
      marketingCostCents: marketing,
    });
    const expectedProfit = incasat + (expected - incasat) * 0.5 - (mentorCost + roomCost + marketing);
    expect(result.projectedProfitCents).toBe(expectedProfit);
  });

  it("breakEvenDistance is 0 when isProfit=true", () => {
    const result = computeCohortBreakeven({
      incasatCents: 10_000,
      expectedCents: 10_000,
      mentorCostCents: 0,
      roomCostCents: 0,
    });
    expect(result.isProfit).toBe(true);
    expect(result.breakEvenDistanceCents).toBe(0);
  });
});
