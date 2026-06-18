/**
 * PAR-AUTO-001: tests for POST /api/par/extract (auto-complete PAR from a document).
 *
 * Structural + mapping tests (no DB needed): the route reuses captureExtractor's stub,
 * so we verify it's exported, mounted, and that the stub's fields map onto the PAR
 * shape the form expects (payeeName, payeeIban, amount, date, purpose).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { CAPTURE_EXTRACT_STUB } from "../lib/ai/captureExtractor";

describe("PAR-AUTO-001: route structure", () => {
  it("exports parExtractRoutes (a Hono app)", async () => {
    const mod = await import("../routes/parExtract");
    expect(typeof mod.parExtractRoutes.fetch).toBe("function");
  });

  it("is mounted at /api/par/extract in app.ts (route-mount rule)", () => {
    const app = readFileSync(resolve(__dirname, "../app.ts"), "utf8");
    expect(app).toContain('import { parExtractRoutes }');
    expect(app).toContain('app.route("/api/par/extract", parExtractRoutes)');
  });

  it("is mounted BEFORE the catch-all /api/par so it isn't shadowed", () => {
    const app = readFileSync(resolve(__dirname, "../app.ts"), "utf8");
    const extractIdx = app.indexOf('app.route("/api/par/extract"');
    const catchAllIdx = app.indexOf('app.route("/api/par", parRoutes)');
    expect(extractIdx).toBeGreaterThan(-1);
    expect(catchAllIdx).toBeGreaterThan(-1);
    expect(extractIdx).toBeLessThan(catchAllIdx);
  });
});

describe("PAR-AUTO-001: stub → PAR field mapping", () => {
  // Mirror the mapping the route performs so a change to the stub shape is caught.
  it("stub provides the fields PAR needs (vendor, amount, date, purpose)", () => {
    expect(CAPTURE_EXTRACT_STUB.vendor_name?.value).toBe("Demo Furnizor SRL");
    expect(CAPTURE_EXTRACT_STUB.amount_cents?.value).toBe(10000);
    expect(CAPTURE_EXTRACT_STUB.expense_date?.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof CAPTURE_EXTRACT_STUB.purpose?.value).toBe("string");
  });

  it("amount_cents maps to major-unit amount (10000 cents → 100.00)", () => {
    const cents = CAPTURE_EXTRACT_STUB.amount_cents?.value as number;
    expect(cents / 100).toBe(100);
  });

  it("a null/low-confidence field (iban) is flagged so the UI asks the user to verify", () => {
    expect(CAPTURE_EXTRACT_STUB.iban?.value).toBeNull();
    expect(CAPTURE_EXTRACT_STUB.iban?.low_confidence).toBe(true);
  });
});
