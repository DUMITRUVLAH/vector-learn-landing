/**
 * "Cont de plată" — ad-hoc (no saved invoice) document shaping.
 *
 * The owner's flow: enter client + services + price → render a "Cont de plată" PDF, nothing
 * persisted. These tests cover the PURE shaping/validation/totals layer (shapeAdHocDoc) plus
 * the end-to-end render through the real template (buildInvoiceDocHtml) — no DB, no browser.
 *
 *   [blocant] totals are computed server-side from lines (qty × price × (1+vat))
 *   [blocant] empty / priceless rows are skipped; no valid line → error
 *   [blocant] missing client name → error
 *   [normal]  issuer (tenant) populates "De la" + bank IBAN/SWIFT
 *   [normal]  rendered HTML contains the client, line, and computed total
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { shapeAdHocDoc, type AdHocDocIssuer } from "../finInvoiceDoc";
import { buildInvoiceDocHtml } from "../../lib/fin/invoiceDocTemplate";

const ISSUER: AdHocDocIssuer = {
  name: 'SRL "Vector Learn"',
  iban: "MD24AG000225100013104168",
  bic: "AGRNMD2X",
};
const NOW = "2026-06-24T00:00:00.000Z";

describe("shapeAdHocDoc — totals (server-side, never trust client math)", () => {
  it("[blocant] computes line + grand totals: 2 × 2000.00 @ 20% VAT → 4800.00 total, 800.00 VAT", () => {
    const out = shapeAdHocDoc(
      {
        invoiceNumber: "CP-2026-0001",
        currency: "MDL",
        to: { name: "SRL BARDA MARKETING SOLUTIONS", idno: "1024600080726" },
        lines: [{ description: "Instruire cadre", quantity: 2, unitPriceCents: 200000, vatPct: 20, unit: "buc" }],
      },
      ISSUER,
      NOW
    );
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].lineTotalCents).toBe(480000); // 2*2000 = 4000 net, +20% = 4800
    expect(out.data.totalCents).toBe(480000);
    expect(out.data.vatTotalCents).toBe(80000); // 800.00
  });

  it("[blocant] sums multiple lines with different VAT rates", () => {
    const out = shapeAdHocDoc(
      {
        to: { name: "Client SRL" },
        lines: [
          { description: "A", quantity: 1, unitPriceCents: 100000, vatPct: 20 }, // 1000 → 1200, vat 200
          { description: "B", quantity: 3, unitPriceCents: 50000, vatPct: 0 },   // 1500 → 1500, vat 0
        ],
      },
      ISSUER,
      NOW
    );
    if ("error" in out) throw new Error(out.error);
    expect(out.data.totalCents).toBe(270000);   // 1200 + 1500 = 2700.00
    expect(out.data.vatTotalCents).toBe(20000); // 200.00
  });

  it("[blocant] skips empty-description and zero-price rows", () => {
    const out = shapeAdHocDoc(
      {
        to: { name: "Client SRL" },
        lines: [
          { description: "", quantity: 1, unitPriceCents: 100000, vatPct: 20 }, // no description → skip
          { description: "Real", quantity: 1, unitPriceCents: 0, vatPct: 20 },  // zero price → skip
          { description: "Kept", quantity: 1, unitPriceCents: 100000, vatPct: 0 },
        ],
      },
      ISSUER,
      NOW
    );
    if ("error" in out) throw new Error(out.error);
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].description).toBe("Kept");
  });
});

describe("shapeAdHocDoc — validation", () => {
  it("[blocant] no valid line → error", () => {
    const out = shapeAdHocDoc({ to: { name: "X" }, lines: [] }, ISSUER, NOW);
    expect("error" in out && out.error).toMatch(/linie/i);
  });

  it("[blocant] missing client name → error", () => {
    const out = shapeAdHocDoc(
      { to: { name: "" }, lines: [{ description: "A", quantity: 1, unitPriceCents: 100000, vatPct: 0 }] },
      ISSUER,
      NOW
    );
    expect("error" in out && out.error).toMatch(/beneficiar/i);
  });

  it("falls back to MDL for an unknown currency", () => {
    const out = shapeAdHocDoc(
      { currency: "GBP", to: { name: "X" }, lines: [{ description: "A", quantity: 1, unitPriceCents: 100000, vatPct: 0 }] },
      ISSUER,
      NOW
    );
    if ("error" in out) throw new Error(out.error);
    expect(out.data.currency).toBe("MDL");
  });
});

describe("shapeAdHocDoc — issuer mapping", () => {
  it("[normal] tenant populates the 'De la' party and bank block", () => {
    const out = shapeAdHocDoc(
      { to: { name: "Client SRL", idno: "100200300" }, lines: [{ description: "A", quantity: 1, unitPriceCents: 100000, vatPct: 0 }] },
      ISSUER,
      NOW
    );
    if ("error" in out) throw new Error(out.error);
    expect(out.data.from.name).toBe('SRL "Vector Learn"');
    expect(out.data.bank.iban).toBe("MD24AG000225100013104168");
    expect(out.data.bank.swift).toBe("AGRNMD2X");
    expect(out.data.bank.fiscalCode).toBe("100200300"); // recipient idno in the bank block
  });

  it("defaults issue date to `now` when none provided", () => {
    const out = shapeAdHocDoc(
      { to: { name: "X" }, lines: [{ description: "A", quantity: 1, unitPriceCents: 100000, vatPct: 0 }] },
      ISSUER,
      NOW
    );
    if ("error" in out) throw new Error(out.error);
    expect(out.data.issuedAt).toBe(NOW);
  });
});

describe("end-to-end render through the real template", () => {
  it("[normal] rendered HTML contains client, line description, number, and computed total", () => {
    const out = shapeAdHocDoc(
      {
        invoiceNumber: "CP-2026-0001",
        currency: "MDL",
        to: { name: "SRL BARDA MARKETING SOLUTIONS", idno: "1024600080726" },
        lines: [{ description: "Instruire cadre", quantity: 2, unitPriceCents: 200000, vatPct: 20, unit: "buc" }],
      },
      ISSUER,
      NOW
    );
    if ("error" in out) throw new Error(out.error);
    const html = buildInvoiceDocHtml(out.data, out.lines, { lang: "ro" });
    expect(html).toContain("CP-2026-0001");
    expect(html).toContain("SRL BARDA MARKETING SOLUTIONS");
    expect(html).toContain("Instruire cadre");
    // total 4800.00 MDL → money() renders "L 4 800"
    expect(html).toMatch(/L[\s ]4[\s ]800/);
  });
});
