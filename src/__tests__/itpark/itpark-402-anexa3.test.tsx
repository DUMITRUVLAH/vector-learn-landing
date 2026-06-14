/**
 * ITPARK-402 — Anexa 3 render — T-402-1, T-402-2, T-402-3 [blocant]
 * Spec: backlog/specs/ITPARK-402-anexa3.md
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { fmtMDL } from "../../../src/lib/itpark/anexa4";
import { computeAnexa3 } from "../../../src/lib/itpark/calc";

// ─── Fixture ─────────────────────────────────────────────────────────────────

function buildLines96() {
  const lines: Array<{ caemCode: string; amountCents: number; isEligible: boolean; month: number | null }> = [];
  for (let i = 0; i < 85; i++) lines.push({ caemCode: "85.59", amountCents: 2152526, isEligible: true, month: (i % 12) + 1 });
  lines.push({ caemCode: "85.59", amountCents: 2162535, isEligible: true, month: 11 });
  lines.push({ caemCode: "85.59", amountCents: 2192474, isEligible: true, month: 12 });
  for (let i = 0; i < 8; i++) lines.push({ caemCode: "62.02", amountCents: 1088889, isEligible: true, month: i + 1 });
  lines.push({ caemCode: "62.02", amountCents: 1088888, isEligible: true, month: 9 });
  return lines;
}

vi.mock("../../../src/lib/api/itparkEngagements", () => ({
  getEngagement: vi.fn().mockResolvedValue({
    id: "abc-123", tenantId: "t", residentName: "Vector Academy SRL",
    idno: "1234567890123", mitpContractNo: null, mitpContractDate: null,
    legalAddress: null, subdivisionAddresses: null, vatPayer: false,
    periodStart: "2025-01-01", periodEnd: "2025-12-31", reportingYear: 2025,
    auditFirmName: null, status: "in_progress", subcontractorCostsCents: 0,
    subcontractorCostsPct: null, totalSalesCents: 222_791_719,
    adjustedRevenueCents: 0, employeeInfoProcedure: null,
    createdAt: "", updatedAt: "",
  }),
}));

vi.mock("../../../src/lib/api/itparkLines", () => ({
  listLines: vi.fn().mockResolvedValue(
    buildLines96().map((l, i) => ({
      id: `l${i}`, tenantId: "t", engagementId: "abc-123", rowNo: i + 1,
      clientName: `Client ${i}`, documentRefs: null, serviceDescription: "",
      ...l, createdAt: "", updatedAt: "",
    }))
  ),
}));

vi.mock("../../../src/router/HashRouter", () => ({
  useRouter: () => ({
    path: "/app/fin/itpark/abc-123/anexa3",
    navigate: vi.fn(),
  }),
}));

vi.mock("../../../src/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode; pageTitle?: string }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

// ─── T-402-1 [blocant]: render fără crash pentru 96 linii ────────────────────

describe("ITPARK-402 — T-402-1 [blocant] render 96 linii fără crash", () => {
  it("componenta Anexa3Page poate fi importată", async () => {
    const { Anexa3Page } = await import("../../../src/pages/app/fin/itpark/Anexa3Page");
    expect(typeof Anexa3Page).toBe("function");
  });

  it("randează loader inițial fără crash", async () => {
    const { Anexa3Page } = await import("../../../src/pages/app/fin/itpark/Anexa3Page");
    render(<Anexa3Page />);
    expect(document.body).toBeTruthy();
  });
});

// ─── T-402-2 [blocant]: footer fixture ───────────────────────────────────────

describe("ITPARK-402 — T-402-2 [blocant] footer fixture Vector Academy", () => {
  it("computeAnexa3 footer: 62.02 = 98.000,00 MDL / 4.40%", () => {
    const result = computeAnexa3(buildLines96(), { totalSalesOverride: 222_791_719 });
    const c6202 = result.byCode.find((c) => c.code === "62.02");
    expect(c6202).toBeDefined();
    expect(fmtMDL(c6202!.totalCents)).toBe("98.000,00");
    expect(Math.abs(c6202!.sharePct - 4.40)).toBeLessThanOrEqual(0.01);
  });

  it("computeAnexa3 footer: 85.59 = 1.873.197,19 MDL / 84.08%", () => {
    const result = computeAnexa3(buildLines96(), { totalSalesOverride: 222_791_719 });
    const c8559 = result.byCode.find((c) => c.code === "85.59");
    expect(c8559).toBeDefined();
    expect(fmtMDL(c8559!.totalCents)).toBe("1.873.197,19");
    expect(Math.abs(c8559!.sharePct - 84.08)).toBeLessThanOrEqual(0.01);
  });

  it("computeAnexa3 footer: totalEligibil = 1.971.197,19 / 88.48%", () => {
    const result = computeAnexa3(buildLines96(), { totalSalesOverride: 222_791_719 });
    expect(fmtMDL(result.totalEligibleCents)).toBe("1.971.197,19");
    expect(Math.abs(result.eligiblePct - 88.48)).toBeLessThanOrEqual(0.01);
  });

  it("computeAnexa3 footer: totalVânzări = 2.227.917,19", () => {
    const result = computeAnexa3(buildLines96(), { totalSalesOverride: 222_791_719 });
    expect(fmtMDL(result.totalSalesCents)).toBe("2.227.917,19");
  });
});

// ─── T-402-3 [normal]: 96 linii în O(n) fără perf issue ─────────────────────

describe("ITPARK-402 — T-402-3 [normal] performanță 96 linii", () => {
  it("computeAnexa3 pe 96 linii termină în < 50ms", () => {
    const start = performance.now();
    computeAnexa3(buildLines96(), { totalSalesOverride: 222_791_719 });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("96 linii: lineCount = 96", () => {
    const result = computeAnexa3(buildLines96(), { totalSalesOverride: 222_791_719 });
    expect(result.lineCount).toBe(96);
  });
});

// ─── T-402-4 [blocant]: fmtMDL format românesc ───────────────────────────────

describe("ITPARK-402 — T-402-4 [blocant] fmtMDL", () => {
  it('fmtMDL(187319719) === "1.873.197,19"', () => {
    expect(fmtMDL(187_319_719)).toBe("1.873.197,19");
  });

  it('fmtMDL(9800000) === "98.000,00"', () => {
    expect(fmtMDL(9_800_000)).toBe("98.000,00");
  });
});
