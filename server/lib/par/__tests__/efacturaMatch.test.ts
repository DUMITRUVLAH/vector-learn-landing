/**
 * PAR-EFP — potrivirea e-Facturii primite cu plata unei cereri PAR.
 *
 * Testele apără exact deciziile care pot trimite un reminder greșit unui coleg:
 *   • persoana fizică nu emite e-Factura → nu se așteaptă nimic de la ea;
 *   • o factură refuzată/anulată NU dovedește că prestatorul și-a făcut treaba;
 *   • o factură emisă pe ALTĂ entitate juridică din același workspace nu e a acestei cereri;
 *   • aceeași factură nu poate acoperi două cereri.
 */
import { describe, it, expect } from "vitest";
import {
  expectsEfactura,
  matchInvoiceForPar,
  parseSfsInvoiceXml,
  summarizeSfsInvoice,
  normalizeFiscalId,
  moneyToCents,
  invoiceKey,
  type SfsInvoiceSummary,
} from "../efacturaMatch";

const SUPPLIER = "1002600001234";
const BUYER = "1003600009999";

/** XML în formatul SFS, cu două rânduri de servicii (total 1 200,00 lei). */
const INVOICE_XML = `<Documents>
  <Document>
    <SupplierInfo>
      <CreationMotiv>1</CreationMotiv>
      <DeliveryDate>2026-08-10T00:00:00.000Z</DeliveryDate>
      <Supplier IDNO="${SUPPLIER}"><BankAccount Account="MD24AG000225100013104168" /></Supplier>
      <Buyer IDNO="${BUYER}" />
      <Merchandises>
        <Row Code="1" Name="Consultanță" UnitOfMeasure="ora" Quantity="10" UnitPriceWithoutTVA="83.33" TotalPriceWithoutTVA="833.33" TVA="20" TotalTVA="166.67" TotalPrice="1000.00" />
        <Row Code="2" Name="Deplasare" UnitOfMeasure="buc" Quantity="1" UnitPriceWithoutTVA="166.67" TotalPriceWithoutTVA="166.67" TVA="20" TotalTVA="33.33" TotalPrice="200.00" />
      </Merchandises>
    </SupplierInfo>
  </Document>
</Documents>`;

function invoice(overrides: Partial<SfsInvoiceSummary> = {}): SfsInvoiceSummary {
  return {
    seria: "EFMD",
    number: "000000001",
    invoiceStatus: 7,
    invoiceStatusLabel: "Trimis la Cumpărător",
    supplierIdno: SUPPLIER,
    buyerIdno: BUYER,
    invoiceDate: new Date("2026-08-10T00:00:00.000Z"),
    totalCents: 120000,
    ...overrides,
  };
}

const PAID_AT = new Date("2026-08-12T00:00:00.000Z");
const NOW = new Date("2026-08-28T00:00:00.000Z");

describe("normalizarea codurilor fiscale", () => {
  it("ignoră spațiile și punctuația din cod", () => {
    expect(normalizeFiscalId(" 1002-600 001234 ")).toBe("1002600001234");
    expect(normalizeFiscalId(null)).toBe("");
  });

  it("citește sumele scrise cu virgulă sau cu spații de mie", () => {
    expect(moneyToCents("1 200,00")).toBe(120000);
    expect(moneyToCents("1200.00")).toBe(120000);
    expect(moneyToCents(null)).toBeNull();
  });
});

describe("parsarea XML-ului de factură SFS", () => {
  it("scoate furnizorul, cumpărătorul, data și totalul însumat din rânduri", () => {
    const parsed = parseSfsInvoiceXml(INVOICE_XML);
    expect(parsed.supplierIdno).toBe(SUPPLIER);
    expect(parsed.buyerIdno).toBe(BUYER);
    expect(parsed.invoiceDate?.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(parsed.totalCents).toBe(120000);
  });

  it("nu inventează date când XML-ul lipsește", () => {
    const parsed = parseSfsInvoiceXml(null);
    expect(parsed).toEqual({ supplierIdno: null, buyerIdno: null, invoiceDate: null, totalCents: null });
  });

  it("combină antetul listei cu detaliile din XML", () => {
    const s = summarizeSfsInvoice({ seria: "EFMD", number: "42", invoiceStatus: 3, invoiceStatusLabel: "Acceptat", xml: INVOICE_XML });
    expect(s.supplierIdno).toBe(SUPPLIER);
    expect(s.totalCents).toBe(120000);
    expect(invoiceKey(s)).toBe("EFMD|42");
  });
});

describe("cine datorează o e-Factura", () => {
  const base = { status: "paid", purpose: "execute_payment", payeeType: "juridic", payeeIdnp: SUPPLIER };

  it("persoana juridică plătită datorează factura", () => {
    expect(expectsEfactura(base).expected).toBe(true);
  });

  it("persoana fizică NU emite e-Factura", () => {
    expect(expectsEfactura({ ...base, payeeType: "fizic" }).expected).toBe(false);
    expect(expectsEfactura({ ...base, payeeType: null, vendorKind: "individual" }).expected).toBe(false);
  });

  it("fără cod fiscal nu avem după ce căuta", () => {
    const v = expectsEfactura({ ...base, payeeIdnp: null });
    expect(v.expected).toBe(false);
    expect(v.reason).toContain("cod fiscal");
  });

  it("o cerere neachitată încă nu așteaptă factură", () => {
    expect(expectsEfactura({ ...base, status: "in_finance" }).expected).toBe(false);
  });

  it("cererile de ofertă nu produc facturi", () => {
    expect(expectsEfactura({ ...base, purpose: "obtain_quotations" }).expected).toBe(false);
  });

  it("tipul nedeclarat, dar cu cod fiscal, rămâne de verificat", () => {
    expect(expectsEfactura({ ...base, payeeType: null, vendorKind: null }).expected).toBe(true);
  });
});

describe("potrivirea facturii cu plata", () => {
  const target = { supplierIdno: SUPPLIER, buyerIdno: BUYER, paidAt: PAID_AT, amountCents: 120000 };

  it("găsește factura furnizorului plătit, cu suma identică", () => {
    const m = matchInvoiceForPar(target, [invoice()], { now: NOW });
    expect(m).not.toBeNull();
    expect(m!.invoice.number).toBe("000000001");
    expect(m!.amountMatches).toBe(true);
    expect(m!.note).toContain("sumă identică");
  });

  it("ignoră facturile altui furnizor", () => {
    const m = matchInvoiceForPar(target, [invoice({ supplierIdno: "1009999999999" })], { now: NOW });
    expect(m).toBeNull();
  });

  it("ignoră facturile refuzate, anulate sau rămase ciornă", () => {
    for (const status of [0, 2, 5]) {
      expect(matchInvoiceForPar(target, [invoice({ invoiceStatus: status })], { now: NOW })).toBeNull();
    }
  });

  it("ignoră factura emisă pe altă entitate juridică din workspace", () => {
    const m = matchInvoiceForPar(target, [invoice({ buyerIdno: "1005555555555" })], { now: NOW });
    expect(m).toBeNull();
  });

  it("ignoră facturile din afara ferestrei de timp a plății", () => {
    const vechi = invoice({ invoiceDate: new Date("2026-01-01T00:00:00.000Z") });
    expect(matchInvoiceForPar(target, [vechi], { now: NOW })).toBeNull();
  });

  it("acceptă o sumă diferită, dar o spune explicit", () => {
    const m = matchInvoiceForPar(target, [invoice({ totalCents: 90000 })], { now: NOW });
    expect(m).not.toBeNull();
    expect(m!.amountMatches).toBe(false);
    expect(m!.note).toContain("sumă diferită");
  });

  it("preferă factura cu suma potrivită, chiar dacă alta e mai apropiată ca dată", () => {
    const apropiata = invoice({ number: "000000002", totalCents: 55500, invoiceDate: PAID_AT });
    const potrivita = invoice({ number: "000000003", totalCents: 120000, invoiceDate: new Date("2026-08-05T00:00:00.000Z") });
    const m = matchInvoiceForPar(target, [apropiata, potrivita], { now: NOW });
    expect(m!.invoice.number).toBe("000000003");
  });

  it("nu refolosește o factură deja atribuită altei cereri", () => {
    const used = new Set([invoiceKey({ seria: "EFMD", number: "000000001" })]);
    expect(matchInvoiceForPar(target, [invoice()], { now: NOW, usedKeys: used })).toBeNull();
  });

  it("fără cod fiscal la beneficiar nu se potrivește nimic", () => {
    expect(matchInvoiceForPar({ ...target, supplierIdno: null }, [invoice()], { now: NOW })).toBeNull();
  });
});
