/**
 * FinDesk "Cont de plată" document template tests.
 *
 * The template is a pure function — fully testable without a browser.
 * T-1 [blocant] builds valid HTML with title, number, parties
 * T-2 [blocant] renders one <tr> per line item with correct money formatting
 * T-3 [blocant] totals: subtotal = total - vat; "spre plată" shows the grand total
 * T-4 [normal]  escapes HTML in user-controlled fields (anti-injection)
 * T-5 [normal]  i18n: ru/en swap the document title
 * T-6 [normal]  bank block omitted when no bank fields present
 */
import { describe, it, expect } from "vitest";
import {
  buildInvoiceDocHtml,
  money,
  fmtDate,
  esc,
  type InvoiceDocData,
  type InvoiceDocLine,
} from "../lib/fin/invoiceDocTemplate";

const baseData: InvoiceDocData = {
  invoiceNumber: "FIN-2026-0278",
  currency: "MDL",
  issuedAt: "2026-06-15",
  dueDate: "2026-06-22",
  totalCents: 321_900,
  vatTotalCents: 0,
  notes: null,
  from: { name: "Vector Academy", idno: "1024600035737" },
  to: { name: "Banca Comercială ENERGBANK S.A.", idno: "1003600008150" },
  bank: {
    bankName: 'Banca Comerciala "MOLDOVA - AGROINDBANK" S.A.',
    currency: "MDL",
    iban: "MD87AG000000022516065719",
    swift: "AGRNMD2X",
    fiscalCode: "1024600035737",
    companyName: "Vector Academy",
  },
};

const lines: InvoiceDocLine[] = [
  { description: "Curs instruire AI în Finanțe", quantity: 1, unitPriceCents: 201_200, vatPct: 0, lineTotalCents: 201_200 },
  { description: "Curs instruire Bugetare și KPI", quantity: 1, unitPriceCents: 120_700, vatPct: 0, lineTotalCents: 120_700 },
];

describe("buildInvoiceDocHtml", () => {
  it("T-1 builds valid HTML containing title, number, and both parties", () => {
    const html = buildInvoiceDocHtml(baseData, lines);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Cont de plată");
    expect(html).toContain("FIN-2026-0278");
    expect(html).toContain("Vector Academy");
    expect(html).toContain("Banca Comercială ENERGBANK S.A.");
  });

  it("T-2 renders one row per line with formatted money", () => {
    const html = buildInvoiceDocHtml(baseData, lines);
    const rowCount = (html.match(/<tr/g) ?? []).length;
    // header rows + 2 line rows + totals — at minimum the 2 descriptions are present
    expect(html).toContain("Curs instruire AI în Finanțe");
    expect(html).toContain("Curs instruire Bugetare și KPI");
    expect(html).toContain("L 2 012");
    expect(html).toContain("L 1 207");
    expect(rowCount).toBeGreaterThanOrEqual(2);
  });

  it("T-3 shows the grand total as 'spre plată' / total", () => {
    const html = buildInvoiceDocHtml(baseData, lines);
    // 321900 cents → "L 3 219"
    expect(html).toContain("L 3 219");
    // subtotal = total - vat = 321900 - 0 → also L 3 219
    expect(html).toMatch(/Spre plată/);
  });

  it("T-4 escapes HTML in user-controlled fields", () => {
    const evil: InvoiceDocData = {
      ...baseData,
      to: { name: '<script>alert("x")</script>', idno: null },
      notes: "<img src=x onerror=alert(1)>",
    };
    const html = buildInvoiceDocHtml(evil, lines);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img src=x");
  });

  it("T-5 swaps the document title for ru/en", () => {
    expect(buildInvoiceDocHtml(baseData, lines, { lang: "ru" })).toContain("Счёт на оплату");
    expect(buildInvoiceDocHtml(baseData, lines, { lang: "en" })).toContain("Payment Invoice");
  });

  it("T-6 omits the bank table when no bank fields are present", () => {
    const noBank: InvoiceDocData = {
      ...baseData,
      bank: { bankName: null, currency: null, iban: null, swift: null, fiscalCode: null, companyName: null },
    };
    const html = buildInvoiceDocHtml(noBank, lines);
    expect(html).not.toContain("MD87AG000000022516065719");
  });
});

describe("helpers", () => {
  it("money() formats MDL with space grouping and 'L' symbol", () => {
    expect(money(321_900, "MDL")).toBe("L 3 219");
    expect(money(7_050, "EUR")).toBe("EUR 70,50");
    expect(money(-100_00, "MDL")).toBe("-L 100");
  });

  it("fmtDate() formats as YYYY-MM-DD and handles null", () => {
    expect(fmtDate("2026-06-15")).toBe("2026-06-15");
    expect(fmtDate(null)).toBe("—");
  });

  it("esc() neutralizes angle brackets and quotes", () => {
    expect(esc('<a "b">')).toBe("&lt;a &quot;b&quot;&gt;");
    expect(esc(null)).toBe("");
  });
});
