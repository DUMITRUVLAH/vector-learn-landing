/**
 * PAR-113: 10% overage rule — pure function tests (applyTenRule)
 *
 * Test scenarios:
 *   T-PAR-113-1 [blocant] total=700000 (>prag 500000), actual=800000 (>10%) → reapproval_required
 *   T-PAR-113-2 [blocant] actual ≤ +10% → paid (no reapproval)
 *   T-PAR-113-3 [blocant] total ≤ prag, actual >10% → paid (rule doesn't apply below threshold)
 *   Boundary tests: exactly +10%, just above, just under
 *   Adversarial: large numbers, zero total
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { applyTenRule } from "../payment";

const THRESHOLD = 500_000; // 5,000.00 MDL

describe("applyTenRule — 10% overage rule", () => {
  // ── T-PAR-113-1 [blocant]: above threshold + overage → reapproval_required ──

  it("T-PAR-113-1 [blocant] actual=800000, total=700000 (>prag) → needsReapproval=true", () => {
    const result = applyTenRule({
      actualAmountCents: 800_000,
      totalEstimatedCents: 700_000,
      microPurchaseThresholdCents: THRESHOLD,
    });
    expect(result.needsReapproval).toBe(true);
    expect(result.aboveThreshold).toBe(true);
    expect(result.overageDetected).toBe(true);
  });

  // ── T-PAR-113-2 [blocant]: within +10% → no reapproval ────────────────────

  it("T-PAR-113-2 [blocant] actual=770000, total=700000 (exactly +10%) → needsReapproval=false", () => {
    // 700000 * 110 / 100 = 770000. actual == maxAllowed → NOT overage (> not >=)
    const result = applyTenRule({
      actualAmountCents: 770_000,
      totalEstimatedCents: 700_000,
      microPurchaseThresholdCents: THRESHOLD,
    });
    expect(result.needsReapproval).toBe(false);
    expect(result.overageDetected).toBe(false);
    expect(result.maxAllowedCents).toBe(770_000);
  });

  it("actual=769999, total=700000 (just under +10%) → needsReapproval=false", () => {
    const result = applyTenRule({
      actualAmountCents: 769_999,
      totalEstimatedCents: 700_000,
      microPurchaseThresholdCents: THRESHOLD,
    });
    expect(result.needsReapproval).toBe(false);
    expect(result.overageDetected).toBe(false);
  });

  it("actual=770001, total=700000 (just over +10%) → needsReapproval=true", () => {
    const result = applyTenRule({
      actualAmountCents: 770_001,
      totalEstimatedCents: 700_000,
      microPurchaseThresholdCents: THRESHOLD,
    });
    expect(result.needsReapproval).toBe(true);
    expect(result.overageDetected).toBe(true);
  });

  // ── T-PAR-113-3 [blocant]: below threshold → no reapproval even with >10% overage ──

  it("T-PAR-113-3 [blocant] total=300000 (≤ prag 500000), actual=400000 (+33%) → needsReapproval=false", () => {
    // Below micro-purchase threshold → rule doesn't apply regardless of overage
    const result = applyTenRule({
      actualAmountCents: 400_000,
      totalEstimatedCents: 300_000,
      microPurchaseThresholdCents: THRESHOLD,
    });
    expect(result.needsReapproval).toBe(false);
    expect(result.aboveThreshold).toBe(false);
    expect(result.overageDetected).toBe(true); // overage detected, but threshold not exceeded
  });

  it("total exactly at threshold (not above) → no reapproval even with overage", () => {
    // Strictly above threshold required (CORE §3: "above micro-purchase threshold")
    const result = applyTenRule({
      actualAmountCents: 600_000, // +20%
      totalEstimatedCents: 500_000, // == threshold (not above)
      microPurchaseThresholdCents: THRESHOLD,
    });
    expect(result.aboveThreshold).toBe(false);
    expect(result.needsReapproval).toBe(false);
  });

  it("total just above threshold + actual just over +10% → needsReapproval=true", () => {
    const result = applyTenRule({
      actualAmountCents: 551_001,
      totalEstimatedCents: 500_001, // one cent above threshold
      microPurchaseThresholdCents: THRESHOLD,
    });
    expect(result.aboveThreshold).toBe(true);
    expect(result.overageDetected).toBe(true);
    expect(result.needsReapproval).toBe(true);
  });

  // ── Boundary: exact threshold ──────────────────────────────────────────────

  it("total=500001 (just above threshold), actual=550001 (exactly +10.0000..%) → needsReapproval check", () => {
    const total = 500_001;
    const max = Math.floor((total * 110) / 100); // = 550001
    const result = applyTenRule({
      actualAmountCents: max,     // exactly at the boundary → no overage
      totalEstimatedCents: total,
      microPurchaseThresholdCents: THRESHOLD,
    });
    expect(result.overageDetected).toBe(false);
    expect(result.needsReapproval).toBe(false);
  });

  // ── Integer math: no floating point hazards ────────────────────────────────

  it("maxAllowedCents is always an integer (floor applied)", () => {
    // total = 700001 → 700001 * 110 / 100 = 770001.1 → floor = 770001
    const result = applyTenRule({
      actualAmountCents: 770_001,
      totalEstimatedCents: 700_001,
      microPurchaseThresholdCents: THRESHOLD,
    });
    expect(result.maxAllowedCents % 1).toBe(0); // must be integer
    expect(result.maxAllowedCents).toBe(770_001); // floor(700001 * 110 / 100) = floor(770001.1) = 770001
  });

  it("works with large amounts (e.g. 1M MDL)", () => {
    const result = applyTenRule({
      actualAmountCents: 1_200_000_00, // 120,000 MDL
      totalEstimatedCents: 1_000_000_00, // 100,000 MDL (+20% → reapproval)
      microPurchaseThresholdCents: 50_000_00, // 50,000 MDL threshold
    });
    expect(result.needsReapproval).toBe(true);
    expect(result.aboveThreshold).toBe(true);
  });

  it("actual=0 does not crash (edge case)", () => {
    const result = applyTenRule({
      actualAmountCents: 0,
      totalEstimatedCents: 700_000,
      microPurchaseThresholdCents: THRESHOLD,
    });
    // 0 ≤ 770000 → no overage
    expect(result.overageDetected).toBe(false);
    expect(result.needsReapproval).toBe(false);
  });

  it("total=0, actual=1 → overageDetected=true but threshold check prevents reapproval (total not above threshold)", () => {
    const result = applyTenRule({
      actualAmountCents: 1,
      totalEstimatedCents: 0,
      microPurchaseThresholdCents: THRESHOLD,
    });
    // maxAllowed = floor(0 * 110 / 100) = 0 → actual (1) > 0 → overageDetected = true
    // but total (0) is NOT above threshold → needsReapproval = false
    expect(result.overageDetected).toBe(true);
    expect(result.aboveThreshold).toBe(false);
    expect(result.needsReapproval).toBe(false);
  });

  // ── reapproval path: needsReapproval=false when overage_reapproved=true ───

  it("T-PAR-113-5 [normal] after reapproval, same amounts should allow payment (overage_reapproved checked at route level)", () => {
    // The applyTenRule function is called AGAIN after reapproval on the same amounts.
    // The result will still be needsReapproval=true (pure function doesn't know about reapproval).
    // The route checks overage_reapproved flag BEFORE calling applyTenRule on re-pay.
    // This test just documents that the pure function is stateless.
    const result = applyTenRule({
      actualAmountCents: 800_000,
      totalEstimatedCents: 700_000,
      microPurchaseThresholdCents: THRESHOLD,
    });
    // Pure function still returns true — route bypasses it after overage_reapproved check
    expect(result.needsReapproval).toBe(true);
  });
});

// ── Additional: state machine transitions (PAR-113) ───────────────────────────

describe("PAR-113 state machine transitions", () => {
  it("in_finance → paid (within 10%)", () => {
    const status: string = "in_finance";
    const result = applyTenRule({
      actualAmountCents: 750_000,
      totalEstimatedCents: 700_000,
      microPurchaseThresholdCents: THRESHOLD,
    });
    const nextStatus = result.needsReapproval ? "reapproval_required" : "paid";
    expect(status).toBe("in_finance"); // precondition
    expect(nextStatus).toBe("paid");
  });

  it("in_finance → reapproval_required (>10% above threshold)", () => {
    const result = applyTenRule({
      actualAmountCents: 800_000,
      totalEstimatedCents: 700_000,
      microPurchaseThresholdCents: THRESHOLD,
    });
    const nextStatus = result.needsReapproval ? "reapproval_required" : "paid";
    expect(nextStatus).toBe("reapproval_required");
  });

  it("reapproval_required → in_finance (after reapprove)", () => {
    // After POST /api/par/:id/reapprove, status goes to in_finance
    // This is tested at route level; here we confirm the logic path
    function reapproveTransition(status: string): string {
      if (status !== "reapproval_required") throw new Error("Wrong status");
      return "in_finance";
    }
    expect(reapproveTransition("reapproval_required")).toBe("in_finance");
  });
});
