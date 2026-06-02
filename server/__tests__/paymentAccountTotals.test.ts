/**
 * CONT-PLATA — unit tests for deterministic total computation.
 * These are [blocant]: a payment account that doesn't foot is a broken document.
 */
import { describe, it, expect } from "vitest";
import {
  computeLineTotals,
  computeDocumentTotals,
} from "../lib/paymentAccountTotals";

describe("computeLineTotals", () => {
  it("T-CONT-1 [blocant] — qty × price with 20% VAT", () => {
    const r = computeLineTotals({ quantity: 2, unitPriceCents: 10000, vatRate: 20 });
    expect(r.lineSubtotalCents).toBe(20000);
    expect(r.lineVatCents).toBe(4000);
    expect(r.lineTotalCents).toBe(24000);
  });

  it("T-CONT-2 [blocant] — decimal quantity rounds to nearest ban", () => {
    // 2.5 × 333 bani = 832.5 → 833
    const r = computeLineTotals({ quantity: "2.5", unitPriceCents: 333, vatRate: 0 });
    expect(r.lineSubtotalCents).toBe(833);
    expect(r.lineVatCents).toBe(0);
    expect(r.lineTotalCents).toBe(833);
  });

  it("T-CONT-3 [blocant] — zero VAT line", () => {
    const r = computeLineTotals({ quantity: 1, unitPriceCents: 5000, vatRate: 0 });
    expect(r).toEqual({ lineSubtotalCents: 5000, lineVatCents: 0, lineTotalCents: 5000 });
  });

  it("T-CONT-4 — invalid/negative inputs clamp to zero, never NaN", () => {
    const r = computeLineTotals({ quantity: "abc", unitPriceCents: -10, vatRate: -5 });
    expect(r.lineSubtotalCents).toBe(0);
    expect(r.lineVatCents).toBe(0);
    expect(r.lineTotalCents).toBe(0);
  });
});

describe("computeDocumentTotals", () => {
  it("T-CONT-5 [blocant] — sums lines and footer equals subtotal+vat", () => {
    const { totals, lines } = computeDocumentTotals([
      { quantity: 2, unitPriceCents: 10000, vatRate: 20 }, // 200 + 40 = 240
      { quantity: 1, unitPriceCents: 5000, vatRate: 8 }, // 50 + 4 = 54
    ]);
    expect(lines).toHaveLength(2);
    expect(totals.subtotalCents).toBe(25000);
    expect(totals.vatCents).toBe(4400);
    expect(totals.totalCents).toBe(29400);
    expect(totals.totalCents).toBe(totals.subtotalCents + totals.vatCents);
  });

  it("T-CONT-6 — empty document totals are all zero", () => {
    const { totals } = computeDocumentTotals([]);
    expect(totals).toEqual({ subtotalCents: 0, vatCents: 0, totalCents: 0 });
  });
});
