/**
 * ITPARK-301 — Motor de calcul determinist computeAnexa3
 * Tests: T-301-1 [blocant] + T-301-2 [blocant]
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §3
 *
 * Fixture de aur: dosarul Vector Academy 2025
 *   totalEligible = 197_119_719 cents (1.971.197,19 MDL)
 *   totalSales    = 222_791_719 cents (2.227.917,19 MDL)
 *   share         = 88.48%
 *   62.02         = 9_800_000 cents (98.000,00 MDL) → 4.40%
 *   85.59         = 187_319_719 cents (1.873.197,19 MDL) → 84.08%
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  computeAnexa3,
  roundHalfUp,
  fmtPct,
  type RevenueLineInput,
} from "../../../src/lib/itpark/calc";

// ─── Vector Academy 2025 fixture ─────────────────────────────────────────────
//
// 96 linii reale:
//   87 linii cod 85.59 → total = 187.319.719 cents (1.873.197,19 MDL)
//   9 linii cod 62.02  → total = 9.800.000 cents (98.000,00 MDL)
//   Total eligibil = 187.319.719 + 9.800.000 = 197.119.719 cents
//   Total vânzări  = 197.119.719 + 25.672.000 cents (non-eligibil) = 222.791.719 cents
//   Pondere = 197.119.719 / 222.791.719 × 100 = 88.48%
//
// Notă: în fixture-ul real, restul de 25.672.000 cents sunt venituri non-eligibile
// (cod neeligibil sau non-IT). Îl simulăm cu câteva linii non-eligibile.

function buildVectorAcademyFixture(): RevenueLineInput[] {
  const lines: RevenueLineInput[] = [];

  // 87 linii 85.59 (eligible) — sume diferite care totalizează 187.319.719
  // Utilizăm distribuite: 86 × 2.152.526 cents + 1 × 2.162.733 cents
  // = 186.117.236 + 2.162.733 = 188.279.969 (nu se potrivesc exact)
  // → Folosim suma exactă împărțită uniform:
  // 187.319.719 / 87 = 2.152.526,65... → nu se divide exact
  // → 86 × 2.152.526 + 1 × 2.152.533 = 186.117.236 + 2.152.533 = 188.269.769 (nu OK)
  //
  // Soluție corectă: 4 sume diferite care totalizează exact 187.319.719:
  // 85 × 2.152.526 = 182.964.710
  // 1 × 2.162.535 = 2.162.535
  // 1 × 2.192.474 = 2.192.474
  // Total = 182.964.710 + 2.162.535 + 2.192.474 = 187.319.719 ✓
  for (let i = 0; i < 85; i++) {
    lines.push({ caemCode: "85.59", amountCents: 2152526, isEligible: true, month: (i % 12) + 1 });
  }
  lines.push({ caemCode: "85.59", amountCents: 2162535, isEligible: true, month: 11 });
  lines.push({ caemCode: "85.59", amountCents: 2192474, isEligible: true, month: 12 });
  // Total 85.59 = 85×2.152.526 + 2.162.535 + 2.192.474
  //            = 182.964.710 + 2.162.535 + 2.192.474 = 187.319.719 ✓

  // 9 linii 62.02 (eligible) — totalizează 9.800.000 cents
  // 9 × 1.088.889 = 9.800.001 → nu exact. Folosim 8 × 1.088.889 + 1 × 1.088.888
  // = 8.711.112 + 1.088.888 = 9.800.000 ✓
  for (let i = 0; i < 8; i++) {
    lines.push({ caemCode: "62.02", amountCents: 1088889, isEligible: true, month: i + 1 });
  }
  lines.push({ caemCode: "62.02", amountCents: 1088888, isEligible: true, month: 9 });
  // Total 62.02 = 8×1.088.889 + 1.088.888 = 8.711.112 + 1.088.888 = 9.800.000 ✓

  // Notă: totalSales (2.227.917,19) > totalEligible (1.971.197,19) pentru că
  // există venituri de 256.720,00 MDL în afara Anexei 3 (alte surse).
  // Acestea se reflectă prin totalSalesOverride = 222.791.719 la apelul computeAnexa3.
  // Fixture-ul are exact 96 de linii (87 + 9) — toate eligibile.

  return lines;
}

// ─── T-301-1 [blocant]: fixture Vector Academy se reproduce ──────────────────

describe("ITPARK-301 — computeAnexa3 Vector Academy fixture (T-301-1)", () => {
  // Fixture: 96 linii eligibile. totalSales = 222.791.719 via totalSalesOverride
  // (diferența de 25.672.000 cents vine din venituri în afara Anexei 3)

  it("totalEligibleCents = 197.119.719 (1.971.197,19 MDL) — toleranță ±100 cents", () => {
    const lines = buildVectorAcademyFixture();
    const result = computeAnexa3(lines, { totalSalesOverride: 222_791_719 });
    expect(Math.abs(result.totalEligibleCents - 197_119_719)).toBeLessThanOrEqual(100);
  });

  it("totalSalesCents = 222.791.719 (2.227.917,19 MDL) — toleranță ±100 cents", () => {
    const lines = buildVectorAcademyFixture();
    const result = computeAnexa3(lines, { totalSalesOverride: 222_791_719 });
    expect(Math.abs(result.totalSalesCents - 222_791_719)).toBeLessThanOrEqual(100);
  });

  it("eligiblePct = 88.48% (toleranță ±0.01)", () => {
    const lines = buildVectorAcademyFixture();
    const result = computeAnexa3(lines, { totalSalesOverride: 222_791_719 });
    expect(Math.abs(result.eligiblePct - 88.48)).toBeLessThanOrEqual(0.01);
  });

  it("lineCount = 96 (87 linii 85.59 + 9 linii 62.02)", () => {
    const lines = buildVectorAcademyFixture();
    const result = computeAnexa3(lines, { totalSalesOverride: 222_791_719 });
    expect(result.lineCount).toBe(96);
  });
});

// ─── T-301-2 [blocant]: per-cod fixture Vector Academy ───────────────────────

describe("ITPARK-301 — per-CAEM breakdown (T-301-2)", () => {
  it("62.02 = 9.800.000 cents (~4.40%) — toleranță ±100 cents", () => {
    const lines = buildVectorAcademyFixture();
    const result = computeAnexa3(lines, { totalSalesOverride: 222_791_719 });
    const c6202 = result.byCode.find((c) => c.code === "62.02");
    expect(c6202).toBeDefined();
    expect(Math.abs(c6202!.totalCents - 9_800_000)).toBeLessThanOrEqual(100);
    // 9.800.000 / 222.791.719 × 100 ≈ 4.40%
    expect(Math.abs(c6202!.sharePct - 4.40)).toBeLessThanOrEqual(0.01);
  });

  it("85.59 = 187.319.719 cents (~84.08%) — toleranță ±100 cents", () => {
    const lines = buildVectorAcademyFixture();
    const result = computeAnexa3(lines, { totalSalesOverride: 222_791_719 });
    const c8559 = result.byCode.find((c) => c.code === "85.59");
    expect(c8559).toBeDefined();
    expect(Math.abs(c8559!.totalCents - 187_319_719)).toBeLessThanOrEqual(100);
    // 187.319.719 / 222.791.719 × 100 ≈ 84.08%
    expect(Math.abs(c8559!.sharePct - 84.08)).toBeLessThanOrEqual(0.01);
  });
});

// ─── Cazuri marginale (div/0, zero linii, etc.) ───────────────────────────────

describe("ITPARK-301 — edge cases (no NaN/#DIV/0!)", () => {
  it("zero linii → 0 / 0 / 0% fără eroare", () => {
    const result = computeAnexa3([]);
    expect(result.totalEligibleCents).toBe(0);
    expect(result.totalSalesCents).toBe(0);
    expect(result.eligiblePct).toBe(0);
    expect(result.byCode).toHaveLength(0);
    expect(result.lineCount).toBe(0);
  });

  it("o singură linie eligibilă → pondere 100%", () => {
    const result = computeAnexa3([
      { caemCode: "85.59", amountCents: 1000000, isEligible: true },
    ]);
    expect(result.totalEligibleCents).toBe(1000000);
    expect(result.totalSalesCents).toBe(1000000);
    expect(result.eligiblePct).toBe(100);
  });

  it("o singură linie neeligibilă → pondere 0%", () => {
    const result = computeAnexa3([
      { caemCode: "47.11", amountCents: 500000, isEligible: false },
    ]);
    expect(result.totalEligibleCents).toBe(0);
    expect(result.totalSalesCents).toBe(500000);
    expect(result.eligiblePct).toBe(0);
  });

  it("totalSalesOverride > suma liniilor → folosit pentru pondere", () => {
    const lines: RevenueLineInput[] = [
      { caemCode: "85.59", amountCents: 1000000, isEligible: true },
    ];
    // Override: există venituri suplimentare de 500.000 cents în afara Anexei 3
    const result = computeAnexa3(lines, { totalSalesOverride: 2000000 });
    expect(result.totalSalesCents).toBe(2000000);
    expect(result.eligiblePct).toBe(50); // 1.000.000 / 2.000.000 = 50%
  });

  it("totalSalesOverride < suma liniilor → folosim suma liniilor (nu pondere > 100%)", () => {
    const lines: RevenueLineInput[] = [
      { caemCode: "85.59", amountCents: 1000000, isEligible: true },
      { caemCode: "62.02", amountCents: 500000, isEligible: true },
    ];
    // Override mai mic decât suma → ignorăm override
    const result = computeAnexa3(lines, { totalSalesOverride: 100000 });
    expect(result.totalSalesCents).toBe(1500000); // max(100000, 1500000) = 1500000
    expect(result.eligiblePct).toBe(100);
  });

  it("eligiblePct NaN-free: fără linii → 0 (nu NaN)", () => {
    const result = computeAnexa3([]);
    expect(Number.isNaN(result.eligiblePct)).toBe(false);
    expect(Number.isFinite(result.eligiblePct)).toBe(true);
  });
});

// ─── roundHalfUp helper ───────────────────────────────────────────────────────

describe("ITPARK-301 — roundHalfUp (rotunjire corectă)", () => {
  it("88.4769...% → 88.48", () => {
    // 197.119.719 / 222.791.719 × 100 = 88.4769...
    const raw = (197_119_719 / 222_791_719) * 100;
    expect(roundHalfUp(raw, 2)).toBe(88.48);
  });

  it("0.5 → 1.00 (half-up)", () => {
    expect(roundHalfUp(0.5, 0)).toBe(1);
    expect(roundHalfUp(1.5, 0)).toBe(2);
  });

  it("NaN → 0", () => {
    expect(roundHalfUp(NaN, 2)).toBe(0);
  });

  it("Infinity → 0", () => {
    expect(roundHalfUp(Infinity, 2)).toBe(0);
  });
});

// ─── fmtPct helper ────────────────────────────────────────────────────────────

describe("ITPARK-301 — fmtPct display", () => {
  it("88.48 → conține '88' și '48' și '%'", () => {
    const s = fmtPct(88.48);
    expect(s).toContain("88");
    expect(s).toContain("48");
    expect(s).toContain("%");
  });
});

// ─── Route mount check ────────────────────────────────────────────────────────

describe("ITPARK-301 — Route mount (§3.5.1)", () => {
  it("itparkCalcRoutes exportat din server/routes/itparkCalc.ts", async () => {
    const mod = await import("../../../server/routes/itparkCalc");
    expect(mod.itparkCalcRoutes).toBeDefined();
    expect(typeof mod.itparkCalcRoutes.fetch).toBe("function");
  });

  it("app.ts montează /api/itpark/calc", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const appTs = readFileSync(resolve(__dirname, "../../..") + "/server/app.ts", "utf-8");
    expect(appTs).toContain('"/api/itpark/calc"');
    expect(appTs).toContain("itparkCalcRoutes");
  });

  it("calc.ts exportă computeAnexa3, roundHalfUp, fmtPct", async () => {
    const mod = await import("../../../src/lib/itpark/calc");
    expect(typeof mod.computeAnexa3).toBe("function");
    expect(typeof mod.roundHalfUp).toBe("function");
    expect(typeof mod.fmtPct).toBe("function");
  });
});
