/**
 * INVOICE-REPORTING (matching) — invoice ↔ transaction matcher.
 *
 * The accountant uploads a bank-statement PDF (each transaction → a fin_capture_lines row)
 * and the invoices into the same Invoice Reporting inbox. `matchInvoiceToLines` answers, per
 * invoice, which statement line it pays — the engine behind "is there an invoice for this
 * transaction in the system? yes/no" so the accountant doesn't reconcile each one by hand.
 *
 * These tests pin the scoring behavior (amount+currency strongest, vendor overlap, date
 * proximity) and the threshold below which we report "missing".
 */
import { describe, it, expect } from "vitest";
import {
  matchInvoiceToLines,
  type LineCandidate,
  type InvoiceForMatch,
} from "../../../server/lib/fin/invoiceLineMatch";

const lines: LineCandidate[] = [
  {
    id: "L1",
    origAmount: "15.99 EUR",
    amountCents: 31000,
    counterparty: "DigitalOcean",
    description: "DIGITALOCEAN.COM card ***2084",
    txDate: "2026-01-15",
  },
  {
    id: "L2",
    origAmount: "28.80 USD",
    amountCents: 48857,
    counterparty: "Meta / Facebook Ads",
    description: "FACEBK *5KBSL2RWA2",
    txDate: "2026-01-31",
  },
  {
    id: "L3",
    origAmount: null,
    amountCents: 120000,
    counterparty: "MAIB — transfer intern",
    description: "TRANSFER PE CARD",
    txDate: "2026-01-10",
  },
];

describe("matchInvoiceToLines", () => {
  it("matches on original-currency amount + vendor (strongest signal)", () => {
    const inv: InvoiceForMatch = {
      vendorName: "DigitalOcean LLC",
      amountMajor: 15.99,
      currency: "EUR",
      date: "2026-01-15",
    };
    const res = matchInvoiceToLines(inv, lines);
    expect(res?.lineId).toBe("L1");
    expect(res?.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("matches a Facebook Ads invoice to the FACEBK line by amount + vendor token", () => {
    const inv: InvoiceForMatch = {
      vendorName: "Meta Platforms Ireland",
      amountMajor: 28.8,
      currency: "USD",
      date: "2026-01-30",
    };
    const res = matchInvoiceToLines(inv, lines);
    expect(res?.lineId).toBe("L2");
  });

  it("returns null when nothing clears the confidence threshold", () => {
    const inv: InvoiceForMatch = {
      vendorName: "Totally Unrelated Vendor",
      amountMajor: 999.99,
      currency: "GBP",
      date: "2020-01-01",
    };
    expect(matchInvoiceToLines(inv, lines)).toBeNull();
  });

  it("does not match on date alone (amount/vendor must agree)", () => {
    const inv: InvoiceForMatch = {
      vendorName: null,
      amountMajor: null,
      currency: null,
      date: "2026-01-15",
    };
    // Only date proximity (0.1) — below the 0.5 threshold → no match.
    expect(matchInvoiceToLines(inv, lines)).toBeNull();
  });

  // ─── Regression: currency-agnostic dual-amount matching ──────────────────────
  // invoiceForMatch() hardcodes currency to "MDL" (we don't capture invoice currency) and the
  // AI may read the foreign figure OR an MDL figure off the document. The matcher must still
  // map the invoice. The OLD code only checked the foreign amount and penalised the "MDL"
  // currency, so a Meta/DigitalOcean invoice scored 0.35 and almost nothing matched.

  it("matches a foreign-currency line even when the invoice currency is the hardcoded 'MDL'", () => {
    const inv: InvoiceForMatch = {
      vendorName: null, // amount alone must carry it
      amountMajor: 15.99, // the EUR figure the AI read off the invoice
      currency: "MDL", // what invoiceForMatch always sets
      date: null,
    };
    const res = matchInvoiceToLines(inv, lines);
    expect(res?.lineId).toBe("L1"); // "15.99 EUR" line — was null before the fix
    expect(res?.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("matches an MDL-only transaction (no origAmount) by the account amount", () => {
    const inv: InvoiceForMatch = {
      vendorName: null,
      amountMajor: 1200, // 1200.00 MDL invoice
      currency: "MDL",
      date: null,
    };
    const res = matchInvoiceToLines(inv, lines);
    expect(res?.lineId).toBe("L3"); // amountCents 120000 = 1200 MDL — never matched before the fix
  });

  it("still returns null for an amount that matches neither the foreign nor the MDL side", () => {
    const inv: InvoiceForMatch = {
      vendorName: null,
      amountMajor: 7777.77,
      currency: "MDL",
      date: null,
    };
    expect(matchInvoiceToLines(inv, lines)).toBeNull();
  });
});
