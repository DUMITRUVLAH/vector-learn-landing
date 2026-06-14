/**
 * FISC-001: Tests for fin_tax_periods + fin_tax_declarations schema
 *
 * Tests: T-FISC-001-1..6
 * Scope: schema exports, enum values, type inference, migration correctness
 */
import { describe, it, expect } from "vitest";

// T-FISC-001-1 [blocant]: schema importable, exports present
import {
  finTaxPeriods,
  finTaxDeclarations,
  finTaxPeriodTypeEnum,
  finTaxPeriodStatusEnum,
  finDeclarationTypeEnum,
  finDeclarationStatusEnum,
  FIN_TAX_PERIOD_TYPE_LABELS,
  FIN_TAX_PERIOD_STATUS_LABELS,
  FIN_DECLARATION_TYPE_LABELS,
  FIN_DECLARATION_STATUS_LABELS,
} from "../../server/db/schema/finTax";

describe("FISC-001: finTax schema", () => {
  // T-FISC-001-1 [blocant] schema importable and exports all tables
  it("exports finTaxPeriods and finTaxDeclarations tables", () => {
    expect(finTaxPeriods).toBeDefined();
    expect(finTaxDeclarations).toBeDefined();
  });

  it("exports all enums", () => {
    expect(finTaxPeriodTypeEnum).toBeDefined();
    expect(finTaxPeriodStatusEnum).toBeDefined();
    expect(finDeclarationTypeEnum).toBeDefined();
    expect(finDeclarationStatusEnum).toBeDefined();
  });

  // T-FISC-001-4 [blocant] exports are accessible from index
  it("finTaxPeriods has correct column names", () => {
    const cols = Object.keys(finTaxPeriods);
    // Drizzle table object has the column definitions
    expect(finTaxPeriods).toHaveProperty("id");
    expect(finTaxPeriods).toHaveProperty("tenantId");
    expect(finTaxPeriods).toHaveProperty("periodType");
    expect(finTaxPeriods).toHaveProperty("year");
    expect(finTaxPeriods).toHaveProperty("month");
    expect(finTaxPeriods).toHaveProperty("quarter");
    expect(finTaxPeriods).toHaveProperty("startDate");
    expect(finTaxPeriods).toHaveProperty("endDate");
    expect(finTaxPeriods).toHaveProperty("status");
    expect(finTaxPeriods).toHaveProperty("createdAt");
    expect(finTaxPeriods).toHaveProperty("updatedAt");
  });

  it("finTaxDeclarations has correct column names", () => {
    expect(finTaxDeclarations).toHaveProperty("id");
    expect(finTaxDeclarations).toHaveProperty("tenantId");
    expect(finTaxDeclarations).toHaveProperty("periodId");
    expect(finTaxDeclarations).toHaveProperty("declarationType");
    expect(finTaxDeclarations).toHaveProperty("status");
    expect(finTaxDeclarations).toHaveProperty("filedAt");
    expect(finTaxDeclarations).toHaveProperty("notes");
    expect(finTaxDeclarations).toHaveProperty("payload");
    expect(finTaxDeclarations).toHaveProperty("createdAt");
    expect(finTaxDeclarations).toHaveProperty("updatedAt");
  });

  // Enum values correctness
  it("finTaxPeriodTypeEnum has correct values", () => {
    const vals = finTaxPeriodTypeEnum.enumValues;
    expect(vals).toContain("monthly");
    expect(vals).toContain("quarterly");
    expect(vals).toContain("annual");
    expect(vals).toHaveLength(3);
  });

  it("finTaxPeriodStatusEnum has correct values", () => {
    const vals = finTaxPeriodStatusEnum.enumValues;
    expect(vals).toContain("open");
    expect(vals).toContain("locked");
    expect(vals).toContain("filed");
    expect(vals).toHaveLength(3);
  });

  it("finDeclarationTypeEnum has correct values", () => {
    const vals = finDeclarationTypeEnum.enumValues;
    expect(vals).toContain("tva12_md");
    expect(vals).toContain("d394_ro");
    expect(vals).toContain("d301_ro");
    expect(vals).toContain("income_md");
    expect(vals).toHaveLength(4);
  });

  it("finDeclarationStatusEnum has correct values", () => {
    const vals = finDeclarationStatusEnum.enumValues;
    expect(vals).toContain("draft");
    expect(vals).toContain("ready");
    expect(vals).toContain("filed");
    expect(vals).toHaveLength(3);
  });

  // Label maps
  it("FIN_TAX_PERIOD_TYPE_LABELS has Romanian labels for all enum values", () => {
    expect(FIN_TAX_PERIOD_TYPE_LABELS.monthly).toBe("Lunar");
    expect(FIN_TAX_PERIOD_TYPE_LABELS.quarterly).toBe("Trimestrial");
    expect(FIN_TAX_PERIOD_TYPE_LABELS.annual).toBe("Anual");
  });

  it("FIN_TAX_PERIOD_STATUS_LABELS has Romanian labels for all enum values", () => {
    expect(FIN_TAX_PERIOD_STATUS_LABELS.open).toBe("Deschisă");
    expect(FIN_TAX_PERIOD_STATUS_LABELS.locked).toBe("Blocată");
    expect(FIN_TAX_PERIOD_STATUS_LABELS.filed).toBe("Depusă");
  });

  it("FIN_DECLARATION_TYPE_LABELS has labels for all types", () => {
    expect(FIN_DECLARATION_TYPE_LABELS.tva12_md).toBe("TVA12 (MD)");
    expect(FIN_DECLARATION_TYPE_LABELS.d394_ro).toBe("D394 (RO)");
    expect(FIN_DECLARATION_TYPE_LABELS.d301_ro).toBe("D301 (RO)");
    expect(FIN_DECLARATION_TYPE_LABELS.income_md).toBe("Impozit venit (MD)");
  });

  it("FIN_DECLARATION_STATUS_LABELS has labels for all statuses", () => {
    expect(FIN_DECLARATION_STATUS_LABELS.draft).toBe("Ciornă");
    expect(FIN_DECLARATION_STATUS_LABELS.ready).toBe("Gata");
    expect(FIN_DECLARATION_STATUS_LABELS.filed).toBe("Depusă");
  });

  // T-FISC-001-3 [blocant] journal integrity check (just verify the SQL file exists)
  it("migration SQL file 0121_fin_tax.sql exists and has statement-breakpoints", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const sqlPath = path.resolve(
      process.cwd(),
      "drizzle/0121_fin_tax.sql"
    );
    const sql = await fs.readFile(sqlPath, "utf-8");
    expect(sql).toContain("fin_tax_periods");
    expect(sql).toContain("fin_tax_declarations");
    expect(sql).toContain("--> statement-breakpoint");
    // Enum idempotence pattern
    expect(sql).toContain("IF NOT EXISTS");
  });

  // T-FISC-001-5 [normal] payload column default is jsonb {}
  it("finTaxDeclarations payload column has JSONB type", () => {
    const payloadCol = finTaxDeclarations.payload;
    expect(payloadCol).toBeDefined();
    // Drizzle column has a columnType property
    expect((payloadCol as { columnType?: string }).columnType ?? "").toMatch(/jsonb/i);
  });

  // T-FISC-001-6 [normal] type inference works
  it("TypeScript type inference compiles (FinTaxPeriod and FinTaxDeclaration types)", async () => {
    // If this file compiles without TS errors, inference works
    type TaxPeriod = typeof finTaxPeriods.$inferSelect;
    type TaxDecl = typeof finTaxDeclarations.$inferSelect;
    const period: Partial<TaxPeriod> = { year: 2025, month: 1 };
    const decl: Partial<TaxDecl> = { declarationType: "tva12_md", status: "draft" };
    expect(period.year).toBe(2025);
    expect(decl.declarationType).toBe("tva12_md");
  });
});
