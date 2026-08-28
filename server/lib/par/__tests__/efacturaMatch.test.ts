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
  parseSfsInvoiceDetail,
  parseSfsQrText,
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
    expect(parsed).toEqual({ supplierIdno: null, supplierName: null, buyerIdno: null, invoiceDate: null, totalCents: null });
  });

  it("citește denumirea furnizorului când formularul o expune", () => {
    const xml = INVOICE_XML.replace(`<Supplier IDNO="${SUPPLIER}">`, `<Supplier IDNO="${SUPPLIER}" Name="Consultanți SRL">`);
    expect(parseSfsInvoiceXml(xml).supplierName).toBe("Consultanți SRL");
    // …și nu inventează una când lipsește.
    expect(parseSfsInvoiceXml(INVOICE_XML).supplierName).toBeNull();
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

describe("textul QR al facturii (singura sursă pentru facturile arhivate)", () => {
  // Textul real întors de SFS pentru contul VECTOR ACADEMY (2026-08-28).
  const REAL =
    "EAW 000504087 Furn-1024600080726 Cump-1024600035737 Suma totala-16667.00lei Suma TVA- 0lei " +
    "https://efactura.sfs.md:443/EFactura.aspx?id=2f6593e6-09cf-4e30-9c11-02993a93c6d6";

  it("scoate furnizorul, cumpărătorul, suma și linkul din portal", () => {
    const qr = parseSfsQrText(REAL);
    expect(qr.supplierIdno).toBe("1024600080726");
    expect(qr.buyerIdno).toBe("1024600035737");
    expect(qr.totalCents).toBe(1666700);
    expect(qr.vatCents).toBe(0);
    expect(qr.portalUrl).toBe("https://efactura.sfs.md:443/EFactura.aspx?id=2f6593e6-09cf-4e30-9c11-02993a93c6d6");
  });

  it("citește și sumele scrise fără zecimale", () => {
    const qr = parseSfsQrText("EAS 000363958 Furn-1020600034721 Cump-1024600035737 Suma totala-1248lei Suma TVA- 208.00lei https://efactura.sfs.md/x");
    expect(qr.totalCents).toBe(124800);
    expect(qr.vatCents).toBe(20800);
  });

  it("nu inventează nimic dintr-un text lipsă", () => {
    expect(parseSfsQrText(null)).toEqual({
      supplierIdno: null, buyerIdno: null, totalCents: null, vatCents: null, portalUrl: null,
    });
  });

  it("completează factura arhivată din QR când XML-ul lipsește", () => {
    const s = summarizeSfsInvoice({ seria: "EAW", number: "000504087", invoiceStatus: 6, xml: null, qrText: REAL });
    expect(s.supplierIdno).toBe("1024600080726");
    expect(s.totalCents).toBe(1666700);
    expect(s.portalUrl).toContain("EFactura.aspx");
    // Data nu vine în QR — rămâne necunoscută, nu inventată.
    expect(s.invoiceDate).toBeNull();
  });
});

describe("conținutul complet al facturii (ce scrie în document)", () => {
  // Structura reală întoarsă de SFS pentru o factură primită (nume/coduri înlocuite):
  // denumirile stau în atributul `Title`, totalul în `<Total>`, liniile în `<Row …/>`,
  // iar textul vine escapat — de aceea ghilimelele apar ca `&quot;`.
  const XML = `<Document><SupplierInfo><Seria>EAW</Seria><Number>000504087</Number>` +
    `<IssuedDate>2025-04-02T12:39:51.633+03:00</IssuedDate><DeliveryDate>2025-04-02T09:38:42.306Z</DeliveryDate>` +
    `<Supplier IDNO="1024600080726" Title="&quot;DUCONT GRUP&quot; S.R.L." Address="SEC.BUIUCANI Alba-Iulia nr.21" TaxpayerType="1">` +
    `<BankAccount BranchTitle="BC'MAIB'S.A." BranchCode="AGRNMD2X" Account="MD43AG000000022516391752"><IsManual>false</IsManual></BankAccount></Supplier>` +
    `<Buyer IDNO="1024600035737" Title="VECTOR ACADEMY S.R.L." Address="SEC.CENTRU 31 August 1989 nr.78">` +
    `<BankAccount BranchTitle="" BranchCode="" Account=""><IsManual>true</IsManual></BankAccount></Buyer>` +
    `<LoadingPoint>SEC.BUIUCANI Alba-Iulia nr.21</LoadingPoint><UnloadingPoint>SEC.CENTRU 31 August 1989 nr.78</UnloadingPoint>` +
    `<Total>4920.00</Total><TotalTVA>820.00</TotalTVA><Merchandises>` +
    `<Row Name="Hârtie A4" UnitOfMeasure="buc" Quantity="10" UnitPriceWithoutTVA="410.00" TotalPriceWithoutTVA="4100.00" TVA="20" TotalTVA="820.00" TotalPrice="4920.00"><Dynamic /></Row>` +
    `</Merchandises></SupplierInfo><Signatures><SignatureContent /></Signatures></Document>`;

  it("scoate părțile, datele, totalurile și liniile", () => {
    const d = parseSfsInvoiceDetail(XML)!;
    expect(d.seria).toBe("EAW");
    expect(d.number).toBe("000504087");
    expect(d.issuedDate?.toISOString().slice(0, 10)).toBe("2025-04-02");
    expect(d.deliveryDate?.toISOString().slice(0, 10)).toBe("2025-04-02");
    expect(d.supplier.idno).toBe("1024600080726");
    // Entitățile XML se decodează: altfel ecranul arăta `&quot;DUCONT GRUP&quot; S.R.L.`
    expect(d.supplier.name).toBe('"DUCONT GRUP" S.R.L.');
    expect(d.supplier.bankAccount).toBe("MD43AG000000022516391752");
    expect(d.supplier.bankName).toBe("BC'MAIB'S.A.");
    expect(d.buyer.name).toBe("VECTOR ACADEMY S.R.L.");
    expect(d.buyer.bankAccount).toBeNull();
    expect(d.loadingPoint).toContain("Alba-Iulia");
    expect(d.totalCents).toBe(492000);
    expect(d.totalVatCents).toBe(82000);
    expect(d.signed).toBe(true);
    expect(d.lines).toHaveLength(1);
    expect(d.lines[0]).toMatchObject({
      name: "Hârtie A4",
      unitOfMeasure: "buc",
      quantity: 10,
      unitPriceWithoutVatCents: 41000,
      totalWithoutVatCents: 410000,
      vatRate: "20",
      vatCents: 82000,
      totalCents: 492000,
    });
  });

  it("citește data emiterii și suma și în sumarul folosit la potrivire", () => {
    const s = summarizeSfsInvoice({ seria: "EAW", number: "000504087", invoiceStatus: 6, xml: XML });
    expect(s.supplierIdno).toBe("1024600080726");
    expect(s.invoiceDate?.toISOString().slice(0, 10)).toBe("2025-04-02");
    expect(s.totalCents).toBe(492000);
  });

  it("nu inventează un detaliu dintr-un XML lipsă", () => {
    expect(parseSfsInvoiceDetail(null)).toBeNull();
    expect(parseSfsInvoiceDetail("   ")).toBeNull();
  });
});
