/**
 * EFMD — SIA „e-Factura" Moldova (SFS) SOAP client.
 *
 * Tests for the fixes applied per the official "Ghid de integrare semi
 * automatizat SIA e-Factura" (Chișinău 2025):
 *  - WS-Security header matches WCF TransportWithMessageCredential (pag. 5)
 *  - GetTaxpayersInfo uses the `String` request wrapper (pag. 22)
 *  - PostInvoices XML matches the §5.12 example shape
 *  - SearchInvoices (§5.15) reconciles Seria/Number by APIeInvoiceId
 *  - GetInvoicesContentForPrint (§5.4) + GetInvoicesQRcodes (§5.6)
 */
import { describe, it, expect } from "vitest";
import {
  buildSoapEnvelope,
  generateSfsInvoiceXml,
  computeLineTotals,
  createMockTransport,
  EfacturaMdClient,
  type SfsInvoiceLine,
} from "../../../server/lib/efacturaMoldova";

// ─── WS-Security envelope (the auth fix) ──────────────────────────────────────

describe("EFMD — buildSoapEnvelope (WS-Security / WCF)", () => {
  const env = buildSoapEnvelope("PostInvoices", "<RequestId>r1</RequestId>", "apiuser", "secret#1");

  it("includes a UsernameToken with the username and password", () => {
    expect(env).toContain("<o:Username>apiuser</o:Username>");
    expect(env).toContain("secret#1");
  });

  it("sets Password Type to #PasswordText (WCF requirement)", () => {
    expect(env).toContain('Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText"');
  });

  it("declares the wsu utility namespace", () => {
    expect(env).toContain("oasis-200401-wss-wssecurity-utility-1.0.xsd");
  });

  it("includes a wsu:Timestamp with Created and Expires", () => {
    expect(env).toContain("<u:Timestamp");
    expect(env).toContain("<u:Created>");
    expect(env).toContain("<u:Expires>");
  });

  it("marks Security as mustUnderstand", () => {
    expect(env).toContain('s:mustUnderstand="1"');
  });

  it("escapes XML-special chars in credentials", () => {
    const e = buildSoapEnvelope("X", "<a/>", "user&<>", "p\"'");
    expect(e).toContain("user&amp;&lt;&gt;");
    expect(e).not.toContain("user&<>");
  });
});

// ─── PostInvoices XML matches the §5.12 example ───────────────────────────────

describe("EFMD — generateSfsInvoiceXml", () => {
  const lines: SfsInvoiceLine[] = [
    { code: "1", name: "Curs limba engleză", unitOfMeasure: "buc", quantity: 1, unitPriceWithoutVat: 1000, vatRate: 20 },
  ];

  const xml = generateSfsInvoiceXml({
    supplierIdno: "1002600001257",
    supplierBankAccount: "22241410046",
    buyerIdno: "1002600003354",
    buyerBankAccount: "MD87AG000000022516065719",
    deliveryDate: new Date("2026-05-15T00:00:00Z"),
    internalId: "inv-uuid-1",
    lines,
  });

  it("wraps in <Documents><Document><SupplierInfo>", () => {
    expect(xml).toContain("<Documents>");
    expect(xml).toContain("<SupplierInfo>");
  });

  it("emits Supplier + Buyer IDNO attributes", () => {
    expect(xml).toContain('IDNO="1002600001257"');
    expect(xml).toContain('IDNO="1002600003354"');
  });

  it("emits a Merchandises Row with computed totals", () => {
    expect(xml).toContain('UnitPriceWithoutTVA="1000.00"');
    expect(xml).toContain('TVA="20"');
    expect(xml).toContain('TotalTVA="200.00"');
    expect(xml).toContain('TotalPrice="1200.00"');
  });

  it("carries the internal id as APIeInvoiceId source (AdditionalInformation)", () => {
    expect(xml).toContain("<AdditionalInformation><id>inv-uuid-1</id></AdditionalInformation>");
  });
});

describe("EFMD — computeLineTotals", () => {
  it("computes VAT and totals at 20%", () => {
    const t = computeLineTotals({ code: "1", name: "x", unitOfMeasure: "buc", quantity: 3, unitPriceWithoutVat: 50, vatRate: 20 });
    expect(t.totalWithoutVat).toBe(150);
    expect(t.totalVat).toBe(30);
    expect(t.totalWithVat).toBe(180);
  });
});

// ─── Client over the mock transport ───────────────────────────────────────────

describe("EFMD — EfacturaMdClient (mock transport)", () => {
  const client = new EfacturaMdClient(
    { supplierIdno: "1002600001257", supplierBankAccount: "22241410046", mock: true } as never,
    createMockTransport()
  );

  it("postInvoices reports all documents posted", async () => {
    const xml = generateSfsInvoiceXml({
      supplierIdno: "1002600001257",
      supplierBankAccount: "22241410046",
      buyerIdno: "1002600003354",
      deliveryDate: new Date(),
      internalId: "inv-1",
      lines: [{ code: "1", name: "x", unitOfMeasure: "buc", quantity: 1, unitPriceWithoutVat: 10, vatRate: 20 }],
    });
    const res = await client.postInvoices(xml, "req-1");
    expect(res.totalInvoicesPosted).toBe(1);
    expect(res.errorMessage).toBeNull();
  });

  it("searchByApiInvoiceId returns a deterministic Seria/Number", async () => {
    const a = await client.searchByApiInvoiceId("inv-1", "req-2");
    const b = await client.searchByApiInvoiceId("inv-1", "req-3");
    expect(a?.seria).toBe("EFMD");
    expect(a?.number).toMatch(/^\d{9}$/);
    expect(a?.number).toBe(b?.number); // stable across calls
  });

  it("checkInvoiceStatus maps ACC seria to accepted (3)", async () => {
    const r = await client.checkInvoiceStatus("ACC", "000000001", "req-4");
    expect(r?.invoiceStatus).toBe(3);
  });

  it("checkInvoiceStatus maps REJ seria to rejected (2)", async () => {
    const r = await client.checkInvoiceStatus("REJ", "000000001", "req-5");
    expect(r?.invoiceStatus).toBe(2);
  });

  it("getTaxpayerInfo returns taxpayer for a 13-digit IDNO", async () => {
    const r = await client.getTaxpayerInfo("1002600003354", "req-6");
    expect(r?.idno).toBe("1002600003354");
    expect(r?.isEfacturaActor).toBe(true);
  });

  it("getInvoicePdf returns a decoded PDF buffer", async () => {
    const r = await client.getInvoicePdf("EFMD", "000000123", "req-7");
    expect(r?.pdf).toBeInstanceOf(Buffer);
    expect(r?.pdf.length).toBeGreaterThan(0);
  });

  it("getInvoiceQrCode returns png base64 + decoded text", async () => {
    const r = await client.getInvoiceQrCode("EFMD", "000000123", "req-8");
    expect(r?.pngBase64.length).toBeGreaterThan(0);
    expect(r?.text).toContain("EFMD");
  });

  it("postInvoicesWithAttachment (§5.13) posts invoice + PDF", async () => {
    const xml = generateSfsInvoiceXml({
      supplierIdno: "1002600001257",
      supplierBankAccount: "22241410046",
      buyerIdno: "1002600003354",
      deliveryDate: new Date(),
      internalId: "inv-att-1",
      lines: [{ code: "1", name: "x", unitOfMeasure: "buc", quantity: 1, unitPriceWithoutVat: 10, vatRate: 20 }],
    });
    const pdfB64 = Buffer.from("PDFDATA").toString("base64");
    const res = await client.postInvoicesWithAttachment(xml, "factura.pdf", pdfB64, "req-9");
    expect(res.totalInvoicesPosted).toBe(1);
    expect(res.errorMessage).toBeNull();
  });

  it("getAcceptedInvoices (§5.2) returns accepted invoices", async () => {
    const r = await client.getAcceptedInvoices("req-10");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].invoiceStatus).toBe(3); // Acceptat de Cumpărător
  });

  it("getRejectedInvoices (§5.8) returns rejected invoices", async () => {
    const r = await client.getRejectedInvoices("req-11");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].invoiceStatus).toBe(2); // Refuzat de Cumpărător
  });

  it("getInvoicesBySeriaNumber (§5.3) returns invoices with XML content", async () => {
    const r = await client.getInvoicesBySeriaNumber([{ seria: "EFMD", number: "000000001" }], "req-12");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].xml).toContain("<Documents>");
  });

  it("getLogs (§5.7) returns request log entries", async () => {
    const r = await client.getLogs(new Date(Date.now() - 86400000), new Date(), "req-13");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].method).toBe("PostInvoices");
    expect(r[0].response).toContain("Results");
  });

  it("testConnection returns ok over a working transport", async () => {
    const r = await client.testConnection("req-14");
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/OK/i);
  });
});
