/**
 * CONT-PLATA — unit tests for the PDF money formatter + HTML template builder.
 * The canvas/jsPDF step needs a real browser, but the formatting + content
 * assembly (most error-prone parts) are pure and tested here.
 */
import { describe, it, expect, vi } from "vitest";

// html2canvas/jspdf are only imported at call time inside downloadPaymentAccountPdf,
// but the module imports them at top level — stub so the import doesn't touch canvas.
vi.mock("html2canvas", () => ({ default: vi.fn() }));
vi.mock("jspdf", () => ({ jsPDF: vi.fn() }));

import { money, buildHtml } from "../paymentAccountPdf";
import type { PaymentAccountDetail } from "../api/paymentAccounts";

describe("money", () => {
  it("T-PDF-1 — whole MDL formats as 'L 7 241' (space thousands, no decimals)", () => {
    expect(money(724100)).toBe("L 7 241");
  });
  it("T-PDF-2 — fractional shows comma decimals", () => {
    expect(money(724150)).toBe("L 7 241,50");
  });
  it("T-PDF-3 — zero", () => {
    expect(money(0)).toBe("L 0");
  });
  it("T-PDF-4 — non-MDL currency uses its code as symbol", () => {
    expect(money(100000, "EUR")).toBe("EUR 1 000");
  });
});

const sample: PaymentAccountDetail = {
  id: "11111111-2222-3333-4444-555555555555",
  tenantId: "t1",
  clientId: null,
  series: "CP",
  number: 250,
  documentNumber: "CP-2026-0250",
  status: "issued",
  currency: "MDL",
  issueDate: "2026-06-03T00:00:00.000Z",
  dueDate: "2026-06-10T00:00:00.000Z",
  sellerName: "Vector Academy",
  sellerIdno: "1024600035737",
  sellerVatCode: null,
  sellerAddress: null,
  sellerIban: "MD87AG000000022516065719",
  sellerBankName: 'Banca Comerciala "MOLDOVA - AGROINDBANK" S.A.',
  sellerBankCode: "AGRNMD2X",
  buyerName: "S.R.L. NATURAL SMILE & DESIGN",
  buyerIdno: "1014600004714",
  buyerAddress: null,
  buyerCity: "CHIȘINĂU",
  subtotalCents: 724100,
  vatCents: 0,
  totalCents: 724100,
  notes: null,
  createdAt: "",
  updatedAt: "",
  items: [
    {
      id: "i1",
      position: 0,
      description: "Curs instruire cadre",
      unit: "buc",
      quantity: "1",
      unitPriceCents: 724100,
      vatRate: 0,
      lineSubtotalCents: 724100,
      lineVatCents: 0,
      lineTotalCents: 724100,
    },
  ],
};

describe("buildHtml", () => {
  const html = buildHtml(sample);

  it("T-PDF-5 — header carries the document number and issue/due dates", () => {
    expect(html).toContain("Cont de plată: CP-2026-0250");
    expect(html).toContain("2026-06-03");
    expect(html).toContain("2026-06-10");
  });
  it("T-PDF-6 — both parties present (buyer + seller)", () => {
    expect(html).toContain("S.R.L. NATURAL SMILE &amp; DESIGN");
    expect(html).toContain("Vector Academy");
    expect(html).toContain("1014600004714");
  });
  it("T-PDF-7 — bank block + line + total render", () => {
    expect(html).toContain("IBAN: MD87AG000000022516065719");
    expect(html).toContain("SWIFT: AGRNMD2X");
    expect(html).toContain("Curs instruire cadre");
    expect(html).toContain("L 7 241");
  });
  it("T-PDF-8 — escapes HTML-significant chars (no raw ampersand injection)", () => {
    expect(html).not.toContain("SMILE & DESIGN"); // must be escaped to &amp;
  });
});
