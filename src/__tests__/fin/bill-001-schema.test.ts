/**
 * BILL-001 — Schema fin_invoices + fin_invoice_lines + fin_invoice_reminders
 *
 * T-BILL-001-1 [blocant] finInvoices, finInvoiceLines, finInvoiceReminders exportate din schema/index.ts
 * T-BILL-001-2 [blocant] fin_invoice_status enum acceptă draft, issued, paid, overdue, cancelled
 * T-BILL-001-3 [blocant] finInvoiceLines.vatPct definit NOT NULL (TVA obligatoriu per linie — regula #1)
 * T-BILL-001-4 [blocant] Fișierul 0117_fin_invoices.sql există și conține CREATE TABLE fin_invoices
 * T-BILL-001-5 [blocant] Migrarea 0117 NU conține CREATE TABLE invoices (separare B2B/B2C)
 * T-BILL-001-6 [normal]  finInvoiceReminders are unique constraint pe (invoiceId, reminderDay)
 * T-BILL-001-7 [normal]  finInvoices.agreementId este nullable (suportă facturare ad-hoc)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

describe("BILL-001 — Schema finInvoices (B2B)", () => {
  /**
   * T-BILL-001-1 [blocant]
   * finInvoices, finInvoiceLines, finInvoiceReminders must be exported from schema/index.ts
   */
  it("T-BILL-001-1: finInvoices, finInvoiceLines, finInvoiceReminders exported from schema/index.ts", () => {
    const indexContent = readFileSync(
      join(process.cwd(), "server/db/schema/index.ts"),
      "utf-8"
    );
    expect(indexContent).toContain("finInvoices");
    // The export line should reference finInvoices module
    expect(indexContent).toMatch(/export \* from ["']\.\/finInvoices["']/);
  });

  /**
   * T-BILL-001-2 [blocant]
   * fin_invoice_status enum must accept all 5 lifecycle states.
   */
  it("T-BILL-001-2: fin_invoice_status enum has all 5 lifecycle states", () => {
    const schemaContent = readFileSync(
      join(process.cwd(), "server/db/schema/finInvoices.ts"),
      "utf-8"
    );
    expect(schemaContent).toContain('"draft"');
    expect(schemaContent).toContain('"issued"');
    expect(schemaContent).toContain('"paid"');
    expect(schemaContent).toContain('"overdue"');
    expect(schemaContent).toContain('"cancelled"');
    // Must be declared as a pgEnum
    expect(schemaContent).toContain("pgEnum");
    expect(schemaContent).toContain("fin_invoice_status");
  });

  /**
   * T-BILL-001-3 [blocant]
   * FIN-CORE Rule #1: vatPct must be NOT NULL on fin_invoice_lines.
   * In Drizzle, `.notNull()` is the call that enforces this.
   */
  it("T-BILL-001-3: finInvoiceLines.vatPct is NOT NULL (FIN-CORE Rule #1)", () => {
    const schemaContent = readFileSync(
      join(process.cwd(), "server/db/schema/finInvoices.ts"),
      "utf-8"
    );
    // The schema must define vatPct with .notNull()
    // Check that vatPct is defined and marked NOT NULL
    expect(schemaContent).toContain("vatPct");
    expect(schemaContent).toContain("vat_pct");
    // Check that the column has .notNull() — the line with vatPct should have notNull in the vicinity
    const vatPctLineIdx = schemaContent.indexOf("vat_pct");
    const surroundingText = schemaContent.slice(vatPctLineIdx - 5, vatPctLineIdx + 100);
    expect(surroundingText).toContain("notNull");
  });

  /**
   * T-BILL-001-4 [blocant]
   * Migration 0117_fin_invoices.sql must exist and create the fin_invoices table.
   */
  it("T-BILL-001-4: drizzle/0117_fin_invoices.sql exists and creates fin_invoices", () => {
    const migrationPath = join(
      process.cwd(),
      "drizzle/0117_fin_invoices.sql"
    );
    expect(existsSync(migrationPath)).toBe(true);

    const migrationContent = readFileSync(migrationPath, "utf-8");
    expect(migrationContent).toContain("CREATE TABLE");
    expect(migrationContent).toContain('"fin_invoices"');
    expect(migrationContent).toContain('"fin_invoice_lines"');
    expect(migrationContent).toContain('"fin_invoice_reminders"');
  });

  /**
   * T-BILL-001-5 [blocant]
   * Migration 0117 must NOT create or alter the student `invoices` table.
   * FIN-CORE §1.5: B2B and B2C invoices are completely separate.
   */
  it("T-BILL-001-5: migration 0117 does NOT touch the student invoices table", () => {
    const migrationContent = readFileSync(
      join(process.cwd(), "drizzle/0117_fin_invoices.sql"),
      "utf-8"
    );
    // Must not contain "CREATE TABLE invoices" (without "fin_") or "ALTER TABLE invoices"
    expect(migrationContent).not.toMatch(/CREATE TABLE ["']invoices["']/);
    expect(migrationContent).not.toMatch(/ALTER TABLE ["']invoices["']/);
  });

  /**
   * T-BILL-001-6 [normal]
   * fin_invoice_reminders must have a unique constraint on (invoiceId, reminderDay)
   * for idempotency (one reminder per day per invoice).
   */
  it("T-BILL-001-6: finInvoiceReminders has unique(invoiceId, reminderDay)", () => {
    const schemaContent = readFileSync(
      join(process.cwd(), "server/db/schema/finInvoices.ts"),
      "utf-8"
    );
    expect(schemaContent).toContain("unique");
    expect(schemaContent).toContain("reminderDay");
    // The unique constraint name should be in the migration
    const migrationContent = readFileSync(
      join(process.cwd(), "drizzle/0117_fin_invoices.sql"),
      "utf-8"
    );
    expect(migrationContent).toContain("UNIQUE");
    expect(migrationContent).toContain("reminder_day");
  });

  /**
   * T-BILL-001-7 [normal]
   * finInvoices.agreementId must be nullable to support ad-hoc invoices.
   */
  it("T-BILL-001-7: finInvoices.agreementId is nullable (ad-hoc invoice support)", () => {
    const schemaContent = readFileSync(
      join(process.cwd(), "server/db/schema/finInvoices.ts"),
      "utf-8"
    );
    // agreementId is defined without .notNull() — confirming it's nullable
    expect(schemaContent).toContain("agreementId");
    // Should NOT have .notNull() on the same line as agreementId
    const agreementIdIdx = schemaContent.indexOf("agreementId");
    const lineEnd = schemaContent.indexOf("\n", agreementIdIdx);
    const line = schemaContent.slice(agreementIdIdx, lineEnd);
    expect(line).not.toContain("notNull()");
    // And the comment explains ad-hoc
    expect(schemaContent).toContain("ad-hoc");
  });
});
