/**
 * FISC-003: Tests pentru generare declarații fiscale PDF + CSV
 *
 * Tests: T-FISC-003-1..6
 * Scope: declarationGenerator — PDF content, CSV headers, periodLabel
 */
import { describe, it, expect } from "vitest";
import {
  generateTva12MdPdf,
  generateD394Csv,
  generateD301Csv,
  generateTva12MdCsv,
  generateDeclaration,
  periodLabel,
  type TaxPayload,
} from "../../server/lib/fin/declarationGenerator";
import type { FinTaxDeclaration, FinTaxPeriod } from "../../server/db/schema/finTax";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockPeriod: FinTaxPeriod = {
  id: "period-uuid-001",
  tenantId: "tenant-uuid-001",
  periodType: "monthly",
  year: 2025,
  month: 1,
  quarter: null,
  startDate: "2025-01-01",
  endDate: "2025-01-31",
  status: "open",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const mockDeclaration: FinTaxDeclaration = {
  id: "decl-uuid-abc123",
  tenantId: "tenant-uuid-001",
  periodId: "period-uuid-001",
  declarationType: "tva12_md",
  status: "ready",
  filedAt: null,
  notes: null,
  payload: {
    vat_collected_cents: 120_000,
    vat_deductible_cents: 30_000,
    vat_due_cents: 90_000,
    income_tax_base_cents: 500_000,
    income_tax_cents: 60_000,
    income_tax_rate_pct: 12.0,
    invoice_count: 3,
    expense_count: 2,
    calculated_at: "2025-02-01T10:00:00.000Z",
  } as TaxPayload,
  createdAt: new Date("2025-02-01"),
  updatedAt: new Date("2025-02-01"),
};

const emptyPayloadDecl: FinTaxDeclaration = {
  ...mockDeclaration,
  id: "decl-empty",
  status: "draft",
  payload: {} as TaxPayload,
};

const d394Declaration: FinTaxDeclaration = {
  ...mockDeclaration,
  id: "decl-d394",
  declarationType: "d394_ro",
  payload: {
    vat_collected_cents: 190_000,
    vat_deductible_cents: 0,
    vat_due_cents: 190_000,
    income_tax_base_cents: 1_000_000,
    income_tax_cents: 160_000,
    income_tax_rate_pct: 16.0,
    invoice_count: 5,
    expense_count: 0,
    calculated_at: "2025-02-01T10:00:00.000Z",
  } as TaxPayload,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("FISC-003: declarationGenerator", () => {
  // T-FISC-003-1 [blocant] — PDF TVA12-MD non-gol
  it("T-FISC-003-1: generateTva12MdPdf returnează Buffer non-gol", () => {
    const buf = generateTva12MdPdf(
      mockDeclaration,
      mockPeriod,
      mockDeclaration.payload as TaxPayload
    );
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(100);
    // PDF signature
    const header = buf.slice(0, 5).toString("ascii");
    expect(header).toBe("%PDF-");
  });

  // T-FISC-003-2 [blocant] — CSV D394 conține header corect
  it("T-FISC-003-2: generateD394Csv conține header CIF_FURNIZOR și cel puțin un rând", () => {
    const csv = generateD394Csv(
      d394Declaration,
      mockPeriod,
      d394Declaration.payload as TaxPayload
    );
    expect(csv).toContain("CIF_FURNIZOR");
    expect(csv).toContain("DENUMIRE_FURNIZOR");
    expect(csv).toContain("NR_FACTURA");
    expect(csv).toContain("DATA_FACTURA");
    expect(csv).toContain("VALOARE_FARA_TVA");
    expect(csv).toContain("TVA_COLECTAT");

    const lines = csv.split("\r\n").filter(Boolean);
    // Header + cel puțin 1 rând date
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  // D301 CSV
  it("generateD301Csv conține header DIFERENTA și un rând sumar", () => {
    const csv = generateD301Csv(
      d394Declaration,
      mockPeriod,
      d394Declaration.payload as TaxPayload
    );
    expect(csv).toContain("DIFERENTA");
    expect(csv).toContain("BAZA_TVA");
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines.length).toBe(2); // header + 1 rând sumar
  });

  // TVA12 CSV
  it("generateTva12MdCsv conține indicatorii în română", () => {
    const csv = generateTva12MdCsv(
      mockDeclaration,
      mockPeriod,
      mockDeclaration.payload as TaxPayload
    );
    expect(csv).toContain("TVA colectat");
    expect(csv).toContain("TVA deductibil");
    expect(csv).toContain("TVA de plata");
  });

  // BOM UTF-8 în CSV
  it("CSV conține BOM UTF-8 (pentru Excel)", () => {
    const csv = generateD394Csv(
      d394Declaration,
      mockPeriod,
      d394Declaration.payload as TaxPayload
    );
    // BOM =
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  // generateDeclaration dispatch corect
  it("generateDeclaration returnează PDF pentru format=pdf", () => {
    const result = generateDeclaration(mockDeclaration, mockPeriod, "pdf");
    expect(result.contentType).toBe("application/pdf");
    expect(result.filename).toContain(".pdf");
    expect(result.data).toBeInstanceOf(Buffer);
  });

  it("generateDeclaration returnează CSV pentru format=csv (tva12_md)", () => {
    const result = generateDeclaration(mockDeclaration, mockPeriod, "csv");
    expect(result.contentType).toContain("text/csv");
    expect(result.filename).toContain(".csv");
    expect(typeof result.data).toBe("string");
  });

  it("generateDeclaration returnează CSV D394 pentru d394_ro", () => {
    const result = generateDeclaration(d394Declaration, mockPeriod, "csv");
    expect(result.contentType).toContain("text/csv");
    expect(result.data as string).toContain("CIF_FURNIZOR");
  });

  // periodLabel
  it("periodLabel: monthly → 'Ianuarie 2025'", () => {
    expect(periodLabel(mockPeriod)).toBe("Ianuarie 2025");
  });

  it("periodLabel: quarterly → 'T1 2025'", () => {
    const qPeriod: FinTaxPeriod = {
      ...mockPeriod,
      periodType: "quarterly",
      month: null,
      quarter: 1,
    };
    expect(periodLabel(qPeriod)).toBe("T1 2025");
  });

  it("periodLabel: annual → '2025'", () => {
    const aPeriod: FinTaxPeriod = {
      ...mockPeriod,
      periodType: "annual",
      month: null,
      quarter: null,
    };
    expect(periodLabel(aPeriod)).toBe("2025");
  });
});
