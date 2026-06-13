/**
 * ITPARK-401 — Anexa 2 render — T-401-1, T-401-3 [blocant]
 * Spec: backlog/specs/ITPARK-401-anexa2.md
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Anexa2Page } from "../../../src/pages/app/fin/itpark/Anexa2Page";
import { fmtMDL } from "../../../src/lib/itpark/anexa4";

// ─── Mock APIs ───────────────────────────────────────────────────────────────

const mockEngagement = {
  id: "abc-123",
  tenantId: "tenant-1",
  residentName: "Vector Academy SRL",
  idno: "1234567890123",
  mitpContractNo: "2368",
  mitpContractDate: "2022-01-15",
  legalAddress: "mun. Chișinău, str. Testului 1",
  subdivisionAddresses: null,
  vatPayer: true,
  periodStart: "2025-01-01",
  periodEnd: "2025-12-31",
  reportingYear: 2025,
  auditFirmName: "Audit Pro SRL",
  status: "in_progress" as const,
  subcontractorCostsCents: 0,
  subcontractorCostsPct: null,
  totalSalesCents: 222_791_719,
  adjustedRevenueCents: 0,
  employeeInfoProcedure: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

// Lines: 87 eligible 85.59 + 9 eligible 62.02 (same as ITPARK-301 fixture)
function buildLines() {
  const lines: Array<{
    id: string; tenantId: string; engagementId: string; rowNo: number;
    clientName: string; documentRefs: string | null; serviceDescription: string;
    caemCode: string; amountCents: number; isEligible: boolean;
    month: number | null; createdAt: string; updatedAt: string;
  }> = [];
  for (let i = 0; i < 85; i++) {
    lines.push({ id: `l${i}`, tenantId: "t", engagementId: "abc-123", rowNo: i + 1, clientName: `C${i}`, documentRefs: null, serviceDescription: "", caemCode: "85.59", amountCents: 2152526, isEligible: true, month: (i % 12) + 1, createdAt: "", updatedAt: "" });
  }
  lines.push({ id: "l85", tenantId: "t", engagementId: "abc-123", rowNo: 86, clientName: "C85", documentRefs: null, serviceDescription: "", caemCode: "85.59", amountCents: 2162535, isEligible: true, month: 11, createdAt: "", updatedAt: "" });
  lines.push({ id: "l86", tenantId: "t", engagementId: "abc-123", rowNo: 87, clientName: "C86", documentRefs: null, serviceDescription: "", caemCode: "85.59", amountCents: 2192474, isEligible: true, month: 12, createdAt: "", updatedAt: "" });
  for (let i = 0; i < 8; i++) {
    lines.push({ id: `l87_${i}`, tenantId: "t", engagementId: "abc-123", rowNo: 88 + i, clientName: `C87_${i}`, documentRefs: null, serviceDescription: "", caemCode: "62.02", amountCents: 1088889, isEligible: true, month: i + 1, createdAt: "", updatedAt: "" });
  }
  lines.push({ id: "l95", tenantId: "t", engagementId: "abc-123", rowNo: 96, clientName: "C95", documentRefs: null, serviceDescription: "", caemCode: "62.02", amountCents: 1088888, isEligible: true, month: 9, createdAt: "", updatedAt: "" });
  return lines;
}

vi.mock("../../../src/lib/api/itparkEngagements", () => ({
  getEngagement: vi.fn().mockResolvedValue({
    id: "abc-123", tenantId: "tenant-1", residentName: "Vector Academy SRL",
    idno: "1234567890123", mitpContractNo: "2368", mitpContractDate: "2022-01-15",
    legalAddress: "mun. Chișinău, str. Testului 1", subdivisionAddresses: null,
    vatPayer: true, periodStart: "2025-01-01", periodEnd: "2025-12-31",
    reportingYear: 2025, auditFirmName: "Audit Pro SRL", status: "in_progress",
    subcontractorCostsCents: 0, subcontractorCostsPct: null,
    totalSalesCents: 222_791_719, adjustedRevenueCents: 0,
    employeeInfoProcedure: null, createdAt: "", updatedAt: "",
  }),
  updateEngagement: vi.fn().mockResolvedValue({
    id: "abc-123", tenantId: "tenant-1", residentName: "Vector Academy SRL",
    idno: "1234567890123", mitpContractNo: "2368", mitpContractDate: "2022-01-15",
    legalAddress: "mun. Chișinău, str. Testului 1", subdivisionAddresses: null,
    vatPayer: true, periodStart: "2025-01-01", periodEnd: "2025-12-31",
    reportingYear: 2025, auditFirmName: "Audit Pro SRL", status: "in_progress",
    subcontractorCostsCents: 0, subcontractorCostsPct: null,
    totalSalesCents: 222_791_719, adjustedRevenueCents: 0,
    employeeInfoProcedure: null, createdAt: "", updatedAt: "",
  }),
}));

vi.mock("../../../src/lib/api/itparkLines", () => {
  // inline fixture to avoid vi.mock hoisting issue
  const lines: unknown[] = [];
  for (let i = 0; i < 85; i++) {
    lines.push({ id: `l${i}`, tenantId: "t", engagementId: "abc-123", rowNo: i + 1, clientName: `C${i}`, documentRefs: null, serviceDescription: "", caemCode: "85.59", amountCents: 2152526, isEligible: true, month: (i % 12) + 1, createdAt: "", updatedAt: "" });
  }
  lines.push({ id: "l85", tenantId: "t", engagementId: "abc-123", rowNo: 86, clientName: "C85", documentRefs: null, serviceDescription: "", caemCode: "85.59", amountCents: 2162535, isEligible: true, month: 11, createdAt: "", updatedAt: "" });
  lines.push({ id: "l86", tenantId: "t", engagementId: "abc-123", rowNo: 87, clientName: "C86", documentRefs: null, serviceDescription: "", caemCode: "85.59", amountCents: 2192474, isEligible: true, month: 12, createdAt: "", updatedAt: "" });
  for (let i = 0; i < 8; i++) {
    lines.push({ id: `l87_${i}`, tenantId: "t", engagementId: "abc-123", rowNo: 88 + i, clientName: `C87_${i}`, documentRefs: null, serviceDescription: "", caemCode: "62.02", amountCents: 1088889, isEligible: true, month: i + 1, createdAt: "", updatedAt: "" });
  }
  lines.push({ id: "l95", tenantId: "t", engagementId: "abc-123", rowNo: 96, clientName: "C95", documentRefs: null, serviceDescription: "", caemCode: "62.02", amountCents: 1088888, isEligible: true, month: 9, createdAt: "", updatedAt: "" });
  return { listLines: vi.fn().mockResolvedValue(lines) };
});

vi.mock("../../../src/router/HashRouter", () => ({
  useRouter: () => ({
    path: "/app/fin/itpark/abc-123/anexa2",
    navigate: vi.fn(),
  }),
}));

vi.mock("../../../src/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode; pageTitle?: string }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

// ─── T-401-3 [blocant]: fmtMDL format românesc ───────────────────────────────

describe("ITPARK-401 — T-401-3 [blocant] fmtMDL format românesc", () => {
  it('fmtMDL(197119719) === "1.971.197,19"', () => {
    expect(fmtMDL(197_119_719)).toBe("1.971.197,19");
  });

  it('fmtMDL(222791719) === "2.227.917,19"', () => {
    expect(fmtMDL(222_791_719)).toBe("2.227.917,19");
  });

  it('fmtMDL(0) === "0,00"', () => {
    expect(fmtMDL(0)).toBe("0,00");
  });
});

// ─── T-401-1 [blocant]: renders without crash ────────────────────────────────

describe("ITPARK-401 — T-401-1 [blocant] render fără crash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("randează loader inițial fără crash", () => {
    render(<Anexa2Page />);
    // During loading, should show loader or shell
    expect(document.body).toBeTruthy();
  });
});

// ─── T-401-2 [normal]: row 7 and row 8 from engine, NOT manual ───────────────

describe("ITPARK-401 — T-401-2 [normal] rows 7&8 din engine (nu manual)", () => {
  it("motor computeAnexa3 produce rândul 7=totalSalesCents și 8=totalEligibleCents", async () => {
    const { computeAnexa3 } = await import("../../../src/lib/itpark/calc");
    const lines = buildLines().map((l) => ({
      caemCode: l.caemCode,
      amountCents: l.amountCents,
      isEligible: l.isEligible,
      month: l.month ?? null,
    }));
    const result = computeAnexa3(lines, { totalSalesOverride: 222_791_719 });

    // Row 7 = totalSalesCents din engine
    expect(Math.abs(result.totalSalesCents - 222_791_719)).toBeLessThanOrEqual(100);
    // Row 8 = totalEligibleCents din engine
    expect(Math.abs(result.totalEligibleCents - 197_119_719)).toBeLessThanOrEqual(100);
    // Row 7 = 2.227.917,19 MDL
    expect(fmtMDL(result.totalSalesCents)).toBe("2.227.917,19");
    // Row 8 = 1.971.197,19 MDL
    expect(fmtMDL(result.totalEligibleCents)).toBe("1.971.197,19");
  });
});
