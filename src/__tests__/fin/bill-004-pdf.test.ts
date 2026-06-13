/**
 * BILL-004 — PDF factură B2B: buildFinInvoiceHtml multi-limbă
 *
 * T-BILL-004-1 [blocant] buildFinInvoiceHtml returnează string cu invoiceNumber și totalCents
 * T-BILL-004-2 [blocant] lang="ru" → HTML conține "Счёт-фактура"
 * T-BILL-004-3 [blocant] lang="en" → HTML conține "Invoice" și "Signature"
 * T-BILL-004-4 [blocant] GET /api/fin/invoices/:id/pdf există în route file + returnează html
 * T-BILL-004-5 [blocant] GET /api/fin/invoices/unknown-id/pdf → 404 check în source
 * T-BILL-004-6 [normal]  HTML conține tabelul de linii (<tr> per linie)
 * T-BILL-004-7 [normal]  HTML conține secțiunea de semnătură
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildFinInvoiceHtml, esc, money } from "../../lib/finInvoicePdf";

// ─── Test data ────────────────────────────────────────────────────────────────

const testInvoice = {
  invoiceNumber: "FIN-2026-0042",
  series: "FIN",
  number: 42,
  currency: "MDL",
  issuedAt: "2026-06-14",
  dueDate: "2026-07-14",
  totalCents: 120000, // L 1 200 (2 lines × L 600 each at 20% VAT)
  vatTotalCents: 20000, // L 200 VAT
  notes: "Test invoice for unit testing",
  partyName: "ACME SRL",
  tenantName: "Vector Learn SRL",
};

const testLines = [
  {
    description: "Servicii software lunar",
    quantity: 2,
    unitPriceCents: 50000,
    vatPct: 20,
    lineTotalCents: 120000,
  },
];

describe("BILL-004 — PDF factură B2B", () => {
  /**
   * T-BILL-004-1 [blocant]
   * buildFinInvoiceHtml returns a non-empty string containing invoiceNumber and total.
   */
  it("T-BILL-004-1: buildFinInvoiceHtml returns string with invoiceNumber and total", () => {
    const html = buildFinInvoiceHtml(testInvoice, testLines);
    expect(typeof html).toBe("string");
    expect(html.length).toBeGreaterThan(100);
    // Contains invoice number
    expect(html).toContain("FIN-2026-0042");
    // Contains formatted total (120000 cents = L 1 200 — use regex to handle any whitespace variant)
    expect(html).toMatch(/L[\s ]1[\s ]200/);
    // Contains party name
    expect(html).toContain("ACME SRL");
  });

  /**
   * T-BILL-004-2 [blocant]
   * lang="ru" → HTML contains "Счёт-фактура" (Cyrillic title).
   */
  it("T-BILL-004-2: lang=ru contains Счёт-фактура", () => {
    const html = buildFinInvoiceHtml(testInvoice, testLines, { lang: "ru" });
    expect(html).toContain("СЧЁТ-ФАКТУРА");
    // Should not contain Romanian title
    expect(html).not.toContain("FACTURĂ FISCALĂ");
  });

  /**
   * T-BILL-004-3 [blocant]
   * lang="en" → HTML contains "INVOICE" and "Signature".
   */
  it("T-BILL-004-3: lang=en contains Invoice and Signature", () => {
    const html = buildFinInvoiceHtml(testInvoice, testLines, { lang: "en" });
    expect(html).toContain("INVOICE");
    expect(html).toContain("Signature");
    // Should not contain Romanian title
    expect(html).not.toContain("FACTURĂ FISCALĂ");
  });

  /**
   * T-BILL-004-4 [blocant]
   * GET /:id/pdf route exists in finInvoices.ts and returns html + invoiceNumber.
   */
  it("T-BILL-004-4: GET /:id/pdf route defined in finInvoices.ts", () => {
    const routeContent = readFileSync(
      join(process.cwd(), "server/routes/finInvoices.ts"),
      "utf-8"
    );
    // Route definition
    expect(routeContent).toContain('"/:id/pdf"');
    // Returns html field
    expect(routeContent).toContain("html");
    expect(routeContent).toContain("invoiceNumber");
    // Uses lang query param
    expect(routeContent).toContain('c.req.query("lang")');
  });

  /**
   * T-BILL-004-5 [blocant]
   * 404 for unknown invoice is handled in the /:id/pdf handler.
   */
  it("T-BILL-004-5: /:id/pdf returns 404 when invoice not found", () => {
    const routeContent = readFileSync(
      join(process.cwd(), "server/routes/finInvoices.ts"),
      "utf-8"
    );
    // The pdf route handler must be defined
    expect(routeContent).toContain('"/:id/pdf"');
    // The route file must contain a 404 response somewhere in the /:id/pdf section
    // Since both the pdf and /:id routes share the 404 pattern, verify it's in the file
    // and that the pdf route does a single-invoice lookup (which returns 404 if not found)
    const pdfIdx = routeContent.indexOf('"/:id/pdf"');
    const postLinesIdx = routeContent.indexOf('"/:id/lines"', routeContent.indexOf('"/:id/pdf"') + 10);
    const pdfSection = routeContent.slice(pdfIdx, postLinesIdx > pdfIdx ? postLinesIdx : pdfIdx + 2000);
    expect(pdfSection).toContain("404");
    expect(pdfSection).toContain("Factura nu a fost găsită");
  });

  /**
   * T-BILL-004-6 [normal]
   * HTML contains the line table with at least one <tr> row per line item.
   */
  it("T-BILL-004-6: HTML contains line table rows", () => {
    const html = buildFinInvoiceHtml(testInvoice, testLines);
    // Count <tr> elements — should have at least: 1 header + 1 line = 2
    const trCount = (html.match(/<tr/gi) ?? []).length;
    expect(trCount).toBeGreaterThanOrEqual(2);
    // Line description appears in the HTML
    expect(html).toContain("Servicii software lunar");
    // Quantity appears
    expect(html).toContain("2");
  });

  /**
   * T-BILL-004-7 [normal]
   * HTML contains the signature block in default (ro) language.
   */
  it("T-BILL-004-7: HTML contains signature block (Semnătură)", () => {
    const html = buildFinInvoiceHtml(testInvoice, testLines);
    expect(html).toContain("Semnătură");
    // Also has stamp area
    expect(html).toContain("Ștampilă");
  });

  /**
   * Helper function tests — esc() and money().
   */
  it("esc() escapes HTML special chars", () => {
    expect(esc("<script>")).toBe("&lt;script&gt;");
    expect(esc("AT&T")).toBe("AT&amp;T");
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });

  it("money() formats cents correctly", () => {
    // Use regex to handle different whitespace chars (space vs narrow no-break space)
    expect(money(120000, "MDL")).toMatch(/^L[\s ]1[\s ]200$/);
    expect(money(50, "MDL")).toMatch(/^L[\s ]0,50$/);
    expect(money(0, "MDL")).toMatch(/^L[\s ]0$/);
    expect(money(-10000, "MDL")).toMatch(/^-L[\s ]100$/);
    expect(money(100000, "EUR")).toMatch(/^EUR[\s ]1[\s ]000$/);
  });

  /**
   * Default language test.
   */
  it("default lang=ro contains FACTURĂ FISCALĂ", () => {
    const html = buildFinInvoiceHtml(testInvoice, testLines);
    expect(html).toContain("FACTURĂ FISCALĂ");
  });

  /**
   * Verify /:id/pdf is defined BEFORE /:id in routes to prevent param shadowing.
   */
  it("T-BILL-004-ARCH: /:id/pdf defined before /:id (param shadowing prevention)", () => {
    const routeContent = readFileSync(
      join(process.cwd(), "server/routes/finInvoices.ts"),
      "utf-8"
    );
    const pdfIdx = routeContent.indexOf('"/:id/pdf"');
    // The GET /:id handler
    const getIdIdx = routeContent.indexOf("// ─── GET /api/fin/invoices/:id ─");
    expect(pdfIdx).toBeGreaterThan(0);
    expect(getIdIdx).toBeGreaterThan(0);
    expect(pdfIdx).toBeLessThan(getIdIdx);
  });
});
