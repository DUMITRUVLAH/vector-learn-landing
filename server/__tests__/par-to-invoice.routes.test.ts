/**
 * PAR-FIN-001: tests for POST /api/par/:id/to-invoice (PAR → FinDesk draft invoice).
 *
 * Structural tests (no DB needed): the router is exported, mounted before the
 * catch-all parRoutes (so /:id/to-invoice isn't shadowed), and the source enforces
 * the key safety rules (approved-only, find-or-create supplier party, draft + VAT 0).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = readFileSync(resolve(__dirname, "../routes/parToInvoice.ts"), "utf8");
const APP = readFileSync(resolve(__dirname, "../app.ts"), "utf8");

describe("PAR-FIN-001: route structure + mount order", () => {
  it("exports parToInvoiceRoutes (a Hono app)", async () => {
    const mod = await import("../routes/parToInvoice");
    expect(typeof mod.parToInvoiceRoutes.fetch).toBe("function");
  });

  it("is imported and mounted in app.ts (route-mount rule)", () => {
    expect(APP).toContain('import { parToInvoiceRoutes }');
    expect(APP).toContain('app.route("/api/par", parToInvoiceRoutes)');
  });

  it("is mounted BEFORE the catch-all parRoutes so /:id/to-invoice isn't shadowed", () => {
    const bridgeIdx = APP.indexOf('app.route("/api/par", parToInvoiceRoutes)');
    const catchAllIdx = APP.indexOf('app.route("/api/par", parRoutes)');
    expect(bridgeIdx).toBeGreaterThan(-1);
    expect(catchAllIdx).toBeGreaterThan(-1);
    expect(bridgeIdx).toBeLessThan(catchAllIdx);
  });
});

describe("PAR-FIN-001: safety rules in source", () => {
  it("only bridges approved/in_finance/paid PARs", () => {
    expect(SRC).toContain('["approved", "in_finance", "paid"]');
    expect(SRC).toContain("not_approved");
  });

  it("requires a payee before generating an invoice", () => {
    expect(SRC).toContain("no_payee");
  });

  it("find-or-creates a SUPPLIER party (PAR beneficiary is a supplier, not a buyer)", () => {
    expect(SRC).toContain('kind: "supplier"');
  });

  it("creates a DRAFT invoice with VAT 0 (accountant sets VAT on review) — never auto-submits to SFS", () => {
    expect(SRC).toContain("vatTotalCents: 0");
    expect(SRC).not.toContain("/submit");
  });

  it("enforces tenant scoping + a role/ownership check", () => {
    expect(SRC).toContain("getUserPARRoles");
    expect(SRC).toContain("forbidden");
    expect(SRC).toContain("eq(parRequests.tenantId, tenantId)");
  });
});
