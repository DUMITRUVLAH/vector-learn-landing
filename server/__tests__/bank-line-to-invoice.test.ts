/**
 * BANK-INV-001: bank-statement line → invoice.
 *
 * Tests the IDNO extraction added to the statement extractor (pure heuristic),
 * plus structural/safety checks on the route (incoming-only, find-or-create
 * CLIENT, draft + VAT 0, mounted before the captures catch-all).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { parseStatementHeuristic } from "../lib/ai/statementExtractor";

const ROUTE = readFileSync(resolve(__dirname, "../routes/finLineToInvoice.ts"), "utf8");
const APP = readFileSync(resolve(__dirname, "../app.ts"), "utf8");

describe("BANK-INV-001: IDNO extraction in the statement heuristic", () => {
  it("pulls a tagged IDNO from a MAIB-style line description", () => {
    // A MAIB line: date date description origAmt cur acctAmt balance
    const text =
      "01.10.2025 01.10.2025 Incasare SRL EXEMPLU IDNO 1009600012345 Alimentare 1000.00 MDL 1000.00 5000.00";
    const txns = parseStatementHeuristic(text);
    expect(txns.length).toBeGreaterThan(0);
    expect(txns[0].counterparty_idno).toBe("1009600012345");
  });

  it("leaves counterparty_idno null when no fiscal code is present", () => {
    const text = "01.10.2025 01.10.2025 DIGITALOCEAN.COM card ***2084 28.80 USD 488.57 721.92";
    const txns = parseStatementHeuristic(text);
    expect(txns[0]?.counterparty_idno ?? null).toBeNull();
  });
});

describe("BANK-INV-001: route structure + safety", () => {
  it("exports finLineToInvoiceRoutes (a Hono app)", async () => {
    const mod = await import("../routes/finLineToInvoice");
    expect(typeof mod.finLineToInvoiceRoutes.fetch).toBe("function");
  });

  it("is mounted BEFORE finCapturesRoutes so /captures/lines/:id/to-invoice isn't shadowed", () => {
    const mineIdx = APP.indexOf('app.route("/api/fin", finLineToInvoiceRoutes)');
    const capturesIdx = APP.indexOf('app.route("/api/fin", finCapturesRoutes)');
    expect(mineIdx).toBeGreaterThan(-1);
    expect(capturesIdx).toBeGreaterThan(-1);
    expect(mineIdx).toBeLessThan(capturesIdx);
  });

  it("only invoices INCOMING lines (e-Factura is a sales doc to a buyer)", () => {
    expect(ROUTE).toContain('line.direction !== "in"');
    expect(ROUTE).toContain("not_incoming");
  });

  it("find-or-creates a CLIENT party (the payer is your client)", () => {
    expect(ROUTE).toContain('kind: "client"');
  });

  it("creates a DRAFT invoice with VAT 0 and never auto-submits to SFS", () => {
    expect(ROUTE).toContain("vatTotalCents: 0");
    expect(ROUTE).not.toContain("/submit");
  });

  it("is tenant-scoped", () => {
    expect(ROUTE).toContain("eq(finCaptureLines.tenantId, tenantId)");
  });
});
