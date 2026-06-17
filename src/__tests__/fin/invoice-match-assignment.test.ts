/**
 * INVOICE-REPORTING — full-reporting-set matching (the owner's real scenario).
 *
 * The accountant marks a month's transactions, then uploads the invoices/confirmations that
 * belong to them. Every uploaded document SHOULD map to its transaction even though:
 *   - the invoice date is 1–3 days off the statement settlement date,
 *   - the currency differs (invoice in EUR/USD, statement booked in MDL),
 *   - vendor names vary ("Meta Platforms" vs "FACEBK *…"),
 *   - some docs are bank confirmations whose filename carries the card ref / transaction id.
 *
 * These tests pin the flexible matcher + greedy 1:1 assignment and prove a realistic set maps
 * 100%. Pure (no AI/db) — mirrors what POST /api/fin/captures/match runs server-side.
 */
import { describe, it, expect } from "vitest";
import {
  scoreInvoiceLine,
  assignInvoicesToLines,
  extractRefTokens,
  matchInvoiceToLines,
  type LineCandidate,
  type InvoiceForMatch,
} from "../../../server/lib/fin/invoiceLineMatch";

// A realistic MAIB statement slice (account currency MDL; foreign charges keep orig_amount).
const lines: LineCandidate[] = [
  { id: "tx_do",    origAmount: "28.80 USD",  amountCents: 48857,  counterparty: "DigitalOcean",        description: "DIGITALOCEAN.COM card ***2084",  txDate: "2025-10-01" },
  { id: "tx_capcut",origAmount: "9.99 USD",   amountCents: 16937,  counterparty: "CapCut",              description: "CAPCUT card ***2084",            txDate: "2025-10-01" },
  { id: "tx_meta1", origAmount: "250.35 EUR", amountCents: 498675, counterparty: "Meta / Facebook Ads", description: "FACEBK *5KBSL2RWA2",             txDate: "2025-10-02" },
  { id: "tx_meta2", origAmount: "130.00 EUR", amountCents: 259080, counterparty: "Meta / Facebook Ads", description: "FACEBK *AJF2CZGWA2",             txDate: "2025-10-03" },
  { id: "tx_tilda", origAmount: "15.00 USD",  amountCents: 25703,  counterparty: "Tilda",               description: "TILDA card ***2084",             txDate: "2025-10-19" },
  { id: "tx_local", origAmount: null,         amountCents: 120000, counterparty: "Librarie SRL",        description: "ACHIZITIE RECHIZITE",            txDate: "2025-10-12" },
];

// One uploaded document per transaction — with the real-world noise described above.
const invoices: Array<{ id: string; fields: InvoiceForMatch }> = [
  // foreign amount + vendor, date 1 day off
  { id: "inv_do", fields: { vendorName: "DigitalOcean LLC", amountMajor: 28.8, currency: "USD", date: "2025-09-30", haystack: "invoice_digitalocean_oct.pdf" } },
  // amount only, vendor name absent on the doc, date 2 days off
  { id: "inv_capcut", fields: { vendorName: null, amountMajor: 9.99, currency: "USD", date: "2025-10-03", haystack: "142233508.pdf" } },
  // MAIB confirmation: filename carries the card ref that's in the statement description
  { id: "inv_meta1", fields: { vendorName: null, amountMajor: 250.35, currency: "EUR", date: null, haystack: "2025-10-02T09-15 Transaction #5KBSL2RWA2-24535677012784572.pdf" } },
  // vendor + amount, date 3 days off
  { id: "inv_meta2", fields: { vendorName: "Meta Platforms Ireland", amountMajor: 130.0, currency: "EUR", date: "2025-10-06", haystack: "meta-invoice-oct.pdf" } },
  // tilda: vendor + foreign amount
  { id: "inv_tilda", fields: { vendorName: "Tilda Publishing", amountMajor: 15.0, currency: "USD", date: "2025-10-19", haystack: "Invoice_TildaPublishing.pdf" } },
  // native-MDL invoice (no foreign amount on the line) — must match by the MDL account amount
  { id: "inv_local", fields: { vendorName: "Libraria", amountMajor: 1200.0, currency: "MDL", date: "2025-10-12", haystack: "factura-rechizite.pdf" } },
];

const EXPECTED: Record<string, string> = {
  tx_do: "inv_do",
  tx_capcut: "inv_capcut",
  tx_meta1: "inv_meta1",
  tx_meta2: "inv_meta2",
  tx_tilda: "inv_tilda",
  tx_local: "inv_local",
};

describe("extractRefTokens", () => {
  it("keeps card refs (letters+digits) and long transaction ids, drops amounts/short numbers", () => {
    const t = extractRefTokens("FACEBK *5KBSL2RWA2 488.57 2025 24535677012784572");
    expect(t.has("5kbsl2rwa2")).toBe(true); // card ref
    expect(t.has("24535677012784572")).toBe(true); // 17-digit tx id
    expect(t.has("488")).toBe(false);
    expect(t.has("2025")).toBe(false);
  });
});

describe("full reporting set — every uploaded invoice maps to its transaction", () => {
  it("assigns 100% of the documents to the correct transactions", () => {
    const byLine = assignInvoicesToLines(
      invoices.map((i) => ({ invoice: { id: i.id }, fields: i.fields })),
      lines,
    );
    // every transaction got its invoice
    expect(byLine.size).toBe(lines.length);
    for (const [lineId, hit] of byLine) {
      expect(hit.invoiceId).toBe(EXPECTED[lineId]);
    }
    // no invoice used twice
    const used = [...byLine.values()].map((v) => v.invoiceId);
    expect(new Set(used).size).toBe(used.length);
  });

  it("the two Meta charges don't collide — amount/ref disambiguates same-vendor lines", () => {
    const byLine = assignInvoicesToLines(
      invoices.map((i) => ({ invoice: { id: i.id }, fields: i.fields })),
      lines,
    );
    expect(byLine.get("tx_meta1")?.invoiceId).toBe("inv_meta1");
    expect(byLine.get("tx_meta2")?.invoiceId).toBe("inv_meta2");
  });
});

describe("scoreInvoiceLine — the flexible signals", () => {
  it("a shared card ref alone is enough to attribute (deterministic)", () => {
    const inv: InvoiceForMatch = { vendorName: null, amountMajor: null, currency: null, date: null, haystack: "Transaction #5KBSL2RWA2.pdf" };
    const meta1 = lines.find((l) => l.id === "tx_meta1")!;
    expect(scoreInvoiceLine(inv, meta1)).toBeGreaterThanOrEqual(0.5);
  });

  it("tolerates a 3-day date gap", () => {
    const inv: InvoiceForMatch = { vendorName: "Meta", amountMajor: 130.0, currency: "EUR", date: "2025-10-06", haystack: "" };
    const meta2 = lines.find((l) => l.id === "tx_meta2")!; // txDate 2025-10-03
    expect(scoreInvoiceLine(inv, meta2)).toBeGreaterThanOrEqual(0.5);
  });

  it("matches a native-MDL invoice to an MDL-only transaction (no foreign amount)", () => {
    const inv: InvoiceForMatch = { vendorName: null, amountMajor: 1200.0, currency: "MDL", date: null, haystack: "" };
    const local = lines.find((l) => l.id === "tx_local")!;
    expect(scoreInvoiceLine(inv, local)).toBeGreaterThanOrEqual(0.5);
  });

  it("matches a receipt even when the AI returned null amount/date (amount-in-text fallback)", () => {
    // Real DigitalOcean case: AI extraction returned null amount + null date, only the vendor.
    // The amount ("-$28.80") is in the document text → must still map to the 28.80 USD line.
    const inv: InvoiceForMatch = {
      vendorName: "DigitalOcean LLC",
      amountMajor: null,
      currency: "MDL",
      date: null,
      haystack: "142233508.pdf DigitalOcean Payment Receipt ID: 142233508 Payment (visa 2084): -$28.80",
    };
    const res = matchInvoiceToLines(inv, lines);
    expect(res?.lineId).toBe("tx_do");
    expect(res?.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("does not false-match an amount embedded inside a longer number", () => {
    const inv: InvoiceForMatch = {
      vendorName: "Nobody",
      amountMajor: null,
      currency: "MDL",
      date: null,
      haystack: "ref 9928.805 txid 1112880577", // contains 28.80/28.8 only as substrings
    };
    expect(matchInvoiceToLines(inv, lines)).toBeNull();
  });

  it("does not attribute an unrelated document", () => {
    const inv: InvoiceForMatch = { vendorName: "Totally Unrelated", amountMajor: 9999.99, currency: "MDL", date: "2020-01-01", haystack: "random.pdf" };
    expect(matchInvoiceToLines(inv, lines)).toBeNull();
  });
});
