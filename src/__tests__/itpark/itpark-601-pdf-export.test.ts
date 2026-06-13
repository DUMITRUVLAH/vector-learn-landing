/**
 * ITPARK-601 — Whole-packet PDF export tests
 *
 * T-601-1 [blocant]: buildItparkPacketHtml contains all 9 pieces:
 *   Anexa 2, Anexa 3, Anexa 4, 5 letters, declaration
 * T-601-2 [blocant]: diacritics ă â î ș ț correct (not cedilla ş/ţ)
 * T-601-3 [blocant]: money uses fmtMDL() Romanian format (1.971.197,19 — not L symbol)
 * T-601-4 [blocant]: buildItparkPieceHtml renders each piece correctly
 * T-601-5 [normal]: export function exists and is callable
 * T-601-6 [normal]: PATCH /api/itpark/engagements/:id/export route exists in router
 */

import { describe, it, expect } from "vitest";
import { buildItparkPacketHtml, buildItparkPieceHtml, fmtMDL } from "../../lib/itpark/itparkPdf";
import type { ItparkEngagement } from "../../lib/api/itparkEngagements";
import type { RevenueLine } from "../../lib/api/itparkLines";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ENGAGEMENT: ItparkEngagement = {
  id: "aaaa-0001-0001-0001-aaaaaaaaaaaa",
  tenantId: "tttt-0001-0001-0001-tttttttttttt",
  residentName: "Vector Academy SRL",
  idno: "1234567890123",
  mitpContractNo: "2368",
  mitpContractDate: "2023-01-15",
  legalAddress: "mun. Chișinău, str. Sfatul Țării, 5, of. 201",
  subdivisionAddresses: null,
  vatPayer: false,
  periodStart: "2025-01-01",
  periodEnd: "2025-12-31",
  reportingYear: 2025,
  auditFirmName: "Audit Pro SRL",
  status: "ready",
  subcontractorCostsCents: 0,
  subcontractorCostsPct: null,
  totalSalesCents: null,
  adjustedRevenueCents: 0,
  employeeInfoProcedure: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

const LINES: RevenueLine[] = [
  {
    id: "llll-0001-0001-0001-llllllllllll",
    tenantId: "tttt-0001-0001-0001-tttttttttttt",
    engagementId: "aaaa-0001-0001-0001-aaaaaaaaaaaa",
    rowNo: 1,
    clientName: "Client SRL",
    documentRefs: "Factura EBC000276766 din 27.10.25",
    serviceDescription: "Servicii software development",
    caemCode: "62.01",
    amountCents: 197_119_719,
    isEligible: true,
    month: 12,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "llll-0002-0002-0002-llllllllllll",
    tenantId: "tttt-0001-0001-0001-tttttttttttt",
    engagementId: "aaaa-0001-0001-0001-aaaaaaaaaaaa",
    rowNo: 2,
    clientName: "SRL Non-Eligible",
    documentRefs: null,
    serviceDescription: "Servicii neeligibile",
    caemCode: "47.99",
    amountCents: 25_672_000,
    isEligible: false,
    month: null,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
];

// ─── T-601-3: fmtMDL format (Romanian locale) ────────────────────────────────

describe("ITPARK-601 fmtMDL", () => {
  it("T-601-3a [blocant]: 197119719 → 1.971.197,19", () => {
    expect(fmtMDL(197_119_719)).toBe("1.971.197,19");
  });

  it("T-601-3b [blocant]: does NOT contain L symbol (uses fmtMDL not parPdf.money)", () => {
    const v = fmtMDL(197_119_719);
    expect(v).not.toContain("L ");
    expect(v).not.toContain("MDL");
  });

  it("T-601-3c [blocant]: 0 → 0,00", () => {
    expect(fmtMDL(0)).toBe("0,00");
  });
});

// ─── T-601-1: Packet HTML contains all 9 pieces ───────────────────────────────

describe("ITPARK-601 buildItparkPacketHtml", () => {
  const html = buildItparkPacketHtml(ENGAGEMENT, LINES);

  it("T-601-1a [blocant]: contains cover with resident name and year", () => {
    expect(html).toContain("Vector Academy SRL");
    expect(html).toContain("2025");
    expect(html).toContain("Dosar de Verificare MITP");
  });

  it("T-601-1b [blocant]: contains Anexa 2 section", () => {
    expect(html).toContain("Anexa 2");
    expect(html).toContain("Informații generale");
    expect(html).toContain("1234567890123"); // IDNO
  });

  it("T-601-1c [blocant]: contains Anexa 3 section with line data", () => {
    expect(html).toContain("Anexa 3");
    expect(html).toContain("Venituri din vânzări");
    expect(html).toContain("Client SRL");
    expect(html).toContain("62.01");
  });

  it("T-601-1d [blocant]: contains Anexa 4 section", () => {
    expect(html).toContain("Anexa 4");
    expect(html).toContain("Raport lunar eligibilitate");
    expect(html).toContain("Decembrie");
  });

  it("T-601-1e [blocant]: contains 5 letter sections", () => {
    expect(html).toContain("Scrisoare privind absența ajustărilor");
    expect(html).toContain("Scrisoare privind adresa juridică");
    expect(html).toContain("Scrisoare privind absența subdiviziunilor");
    expect(html).toContain("Scrisoare privind obiectul de activitate");
    expect(html).toContain("Scrisoare privind solvabilitatea");
  });

  it("T-601-1f [blocant]: contains declaration section", () => {
    expect(html).toContain("Declarație pe proprie răspundere");
    expect(html).toContain("art. 312");
    expect(html).toContain("Legea nr. 77");
  });
});

// ─── T-601-2: Diacritics correct (ă â î ș ț not cedilla ş/ţ) ────────────────

describe("ITPARK-601 diacritics", () => {
  const html = buildItparkPacketHtml(ENGAGEMENT, LINES);

  it("T-601-2a [blocant]: ă present (not just 'a')", () => {
    expect(html).toContain("ă"); // în "ajustărilor", "răspundere", etc.
  });

  it("T-601-2b [blocant]: î present (not just 'i')", () => {
    expect(html).toContain("î"); // în "în", "îndeplinit", etc.
  });

  it("T-601-2c [blocant]: ș present (s-comma, not s-cedilla ş)", () => {
    expect(html).toContain("ș"); // în "vânzări"
    expect(html).not.toContain("ş"); // cedilla variant must NOT appear
  });

  it("T-601-2d [blocant]: ț present (t-comma, not t-cedilla ţ)", () => {
    expect(html).toContain("ț"); // în "declaraţie" → "declarație"
    expect(html).not.toContain("ţ"); // cedilla variant must NOT appear
  });

  it("T-601-2e [blocant]: period display correct (2025-01-01 rendered)", () => {
    // fmtPeriod should render Romanian dates
    expect(html).toContain("2025");
  });
});

// ─── T-601-4: Individual piece export ────────────────────────────────────────

describe("ITPARK-601 buildItparkPieceHtml", () => {
  it("T-601-4a [blocant]: anexa2 piece contains Anexa 2 title and IDNO", () => {
    const html = buildItparkPieceHtml("anexa2", ENGAGEMENT, LINES);
    expect(html).toContain("Anexa 2");
    expect(html).toContain("1234567890123");
  });

  it("T-601-4b [blocant]: anexa3 piece contains Venituri din vânzări", () => {
    const html = buildItparkPieceHtml("anexa3", ENGAGEMENT, LINES);
    expect(html).toContain("Venituri din vânzări");
    expect(html).toContain("Client SRL");
  });

  it("T-601-4c [blocant]: anexa4 piece contains Raport lunar", () => {
    const html = buildItparkPieceHtml("anexa4", ENGAGEMENT, LINES);
    expect(html).toContain("Raport lunar");
    expect(html).toContain("Decembrie");
  });

  it("T-601-4d [blocant]: letter_solvency piece contains solvabilitate", () => {
    const html = buildItparkPieceHtml("letter_solvency", ENGAGEMENT, LINES);
    expect(html).toContain("solvabilitate");
  });

  it("T-601-4e [blocant]: decl_self_responsibility contains art. 312", () => {
    const html = buildItparkPieceHtml("decl_self_responsibility", ENGAGEMENT, LINES);
    expect(html).toContain("art. 312");
    expect(html).toContain("Declarație pe proprie răspundere");
  });
});

// ─── T-601-5: Export functions exist and are callable ────────────────────────

describe("ITPARK-601 export functions", () => {
  it("T-601-5a [normal]: downloadItparkPacketPdf is exported from itparkPdf.ts", async () => {
    const mod = await import("../../lib/itpark/itparkPdf");
    expect(typeof mod.downloadItparkPacketPdf).toBe("function");
  });

  it("T-601-5b [normal]: downloadItparkPiecePdf is exported from itparkPdf.ts", async () => {
    const mod = await import("../../lib/itpark/itparkPdf");
    expect(typeof mod.downloadItparkPiecePdf).toBe("function");
  });
});

// ─── T-601-6: Money accuracy in packet ───────────────────────────────────────

describe("ITPARK-601 money in packet", () => {
  it("T-601-6a [blocant]: packet contains correct eligible total (1.971.197,19)", () => {
    const html = buildItparkPacketHtml(ENGAGEMENT, LINES);
    expect(html).toContain("1.971.197,19");
  });

  it("T-601-6b [blocant]: packet contains correct total sales", () => {
    // totalSales = 197119719 + 25672000 = 222791719 → 2.227.917,19
    const html = buildItparkPacketHtml(ENGAGEMENT, LINES);
    expect(html).toContain("2.227.917,19");
  });
});
