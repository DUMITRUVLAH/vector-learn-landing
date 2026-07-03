/**
 * @vitest-environment node
 * AUTOBILL: server-side invoice PDF (jsPDF in Node) — unit tests.
 */
import { describe, it, expect } from "vitest";
import { generateInvoicePdf } from "../lib/fin/invoicePdf";

describe("AUTOBILL: generateInvoicePdf", () => {
  const base = {
    invoiceNumber: "FIN-2026-0007",
    issuedAt: new Date("2026-07-01T00:00:00Z"),
    dueDate: "2026-07-31",
    currency: "MDL",
    supplierName: "ACME SRL",
    supplierIdno: "1024600035737",
    buyerName: "BETA CLIENT SRL",
    buyerIdno: "1009600020033",
    lines: [
      { description: "Chirie birou", quantity: 1, unitPriceCents: 300000, vatPct: 0, lineTotalCents: 300000 },
      { description: "Mentenanță", quantity: 2, unitPriceCents: 50000, vatPct: 20, lineTotalCents: 120000 },
    ],
    totalCents: 420000,
    vatTotalCents: 20000,
    notes: "Factură recurentă 2026-07",
  };

  it("[blocant] produces a valid PDF (starts with %PDF)", () => {
    const buf = generateInvoicePdf(base);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(500);
  });

  it("does not throw with zero lines / no notes / no due date", () => {
    expect(() =>
      generateInvoicePdf({ ...base, lines: [], notes: null, dueDate: null, buyerIdno: null, supplierIdno: null }),
    ).not.toThrow();
  });

  it("handles many lines (pagination path) without throwing", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      description: `Serviciu ${i + 1}`,
      quantity: 1,
      unitPriceCents: 10000,
      vatPct: 0,
      lineTotalCents: 10000,
    }));
    const buf = generateInvoicePdf({ ...base, lines: many });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
