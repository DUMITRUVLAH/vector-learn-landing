/**
 * @vitest-environment node
 * EFMD: SIA e-Factura Moldova (SFS) — teste unit pentru clientul SOAP,
 * generatorul XML format SFS și fluxul complet pe mock transport.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  EfacturaMdClient,
  EfacturaMdError,
  EFACTURA_MD_STATUS,
  buildSoapEnvelope,
  computeLineTotals,
  createMockTransport,
  deriveSfsIdentifier,
  escapeXml,
  generateSfsInvoiceXml,
  xmlBlocks,
  xmlText,
  type SoapTransport,
} from "../lib/efacturaMoldova";

// ─── XML helpers ─────────────────────────────────────────────────────────────

describe("EFMD: XML helpers", () => {
  it("[blocant] escapeXml escapează toate cele 5 caractere speciale", () => {
    expect(escapeXml(`a&b<c>d"e'f`)).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
  });

  it("xmlText extrage conținutul, inclusiv cu prefix de namespace", () => {
    expect(xmlText("<a><Status>2</Status></a>", "Status")).toBe("2");
    expect(xmlText("<s:Body><ns:Status>3</ns:Status></s:Body>", "Status")).toBe("3");
    expect(xmlText("<a></a>", "Missing")).toBeNull();
  });

  it("xmlBlocks extrage toate blocurile repetate", () => {
    const xml = "<r><Invoice><N>1</N></Invoice><Invoice><N>2</N></Invoice></r>";
    const blocks = xmlBlocks(xml, "Invoice");
    expect(blocks).toHaveLength(2);
    expect(xmlText(blocks[1], "N")).toBe("2");
  });
});

// ─── Calcul totaluri linie ───────────────────────────────────────────────────

describe("EFMD: computeLineTotals", () => {
  it("[blocant] calculează corect TVA 20% (Moldova standard)", () => {
    const t = computeLineTotals({
      code: "1",
      name: "Servicii",
      unitOfMeasure: "buc",
      quantity: 1,
      unitPriceWithoutVat: 500,
      vatRate: 20,
    });
    expect(t.totalWithoutVat).toBe(500);
    expect(t.totalVat).toBe(100);
    expect(t.totalWithVat).toBe(600);
  });

  it("rotunjește corect la 2 zecimale", () => {
    const t = computeLineTotals({
      code: "1",
      name: "X",
      unitOfMeasure: "buc",
      quantity: 3,
      unitPriceWithoutVat: 33.33,
      vatRate: 20,
    });
    expect(t.totalWithoutVat).toBe(99.99);
    expect(t.totalVat).toBe(20.0);
    expect(t.totalWithVat).toBe(119.99);
  });

  it("TVA 0% (scutit) dă total = bază", () => {
    const t = computeLineTotals({
      code: "1",
      name: "X",
      unitOfMeasure: "buc",
      quantity: 1,
      unitPriceWithoutVat: 250,
      vatRate: 0,
    });
    expect(t.totalVat).toBe(0);
    expect(t.totalWithVat).toBe(250);
  });
});

// ─── Generator XML format SFS ────────────────────────────────────────────────

describe("EFMD: generateSfsInvoiceXml (format SFS, NU UBL)", () => {
  const input = {
    supplierIdno: "1002600001257",
    supplierBankAccount: "22241410046",
    buyerIdno: "1002600003354",
    deliveryDate: new Date("2026-06-12T00:00:00Z"),
    internalId: "VECT-2026-0001",
    lines: [
      {
        code: "1",
        name: "Servicii educaționale — Ana Popescu",
        unitOfMeasure: "buc",
        quantity: 1,
        unitPriceWithoutVat: 500,
        vatRate: 20,
      },
    ],
  };

  it("[blocant] produce structura Documents/Document/SupplierInfo cu IDNO-uri", () => {
    const xml = generateSfsInvoiceXml(input);
    expect(xml).toContain("<Documents>");
    expect(xml).toContain('<Supplier IDNO="1002600001257">');
    expect(xml).toContain('<Buyer IDNO="1002600003354">');
    expect(xml).toContain('<BankAccount Account="22241410046" />');
    expect(xml).toContain("<DeliveryDate>2026-06-12T00:00:00.000Z</DeliveryDate>");
  });

  it("[blocant] linia conține toate atributele cerute de SFS cu totaluri corecte", () => {
    const xml = generateSfsInvoiceXml(input);
    expect(xml).toContain('UnitPriceWithoutTVA="500.00"');
    expect(xml).toContain('TotalPriceWithoutTVA="500.00"');
    expect(xml).toContain('TVA="20"');
    expect(xml).toContain('TotalTVA="100.00"');
    expect(xml).toContain('TotalPrice="600.00"');
    expect(xml).toContain('UnitOfMeasure="buc"');
  });

  it("[blocant] identificatorul intern ajunge în AdditionalInformation/id (reconciliere)", () => {
    const xml = generateSfsInvoiceXml(input);
    expect(xml).toContain("<AdditionalInformation><id>VECT-2026-0001</id></AdditionalInformation>");
  });

  it("escapează caractere periculoase din numele liniei (XSS/injection în XML)", () => {
    const xml = generateSfsInvoiceXml({
      ...input,
      lines: [{ ...input.lines[0], name: `Curs <script> & "test"` }],
    });
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("Curs &lt;script&gt; &amp; &quot;test&quot;");
  });

  it("Buyer fără cont bancar nu emite BankAccount gol", () => {
    const xml = generateSfsInvoiceXml(input);
    expect(xml).toContain('<Buyer IDNO="1002600003354"></Buyer>');
  });
});

// ─── SOAP envelope ───────────────────────────────────────────────────────────

describe("EFMD: buildSoapEnvelope", () => {
  it("[blocant] include WS-Security UsernameToken și SOAPAction body corect", () => {
    const env = buildSoapEnvelope("PostInvoices", "<X>1</X>", "supplier", "secret");
    expect(env).toContain("<o:Username>supplier</o:Username>");
    expect(env).toContain("<o:Password>secret</o:Password>");
    expect(env).toContain('<PostInvoices xmlns="http://tempuri.org/">');
    expect(env).toContain("<request><X>1</X></request>");
    expect(env).toContain("oasis-200401-wss-wssecurity-secext-1.0.xsd");
  });

  it("escapează credențialele (parole cu caractere speciale @ sau #)", () => {
    const env = buildSoapEnvelope("GetLogs", "", "user", `p@<>&"ss#`);
    expect(env).toContain("p@&lt;&gt;&amp;&quot;ss#");
  });
});

// ─── deriveSfsIdentifier ─────────────────────────────────────────────────────

describe("EFMD: deriveSfsIdentifier", () => {
  it("numărul are exact 9 cifre cu zero-padding", () => {
    expect(deriveSfsIdentifier(1)).toEqual({ seria: "EFMD", number: "000000001" });
    expect(deriveSfsIdentifier(4664)).toEqual({ seria: "EFMD", number: "000004664" });
  });
});

// ─── Fluxul complet pe mock transport ────────────────────────────────────────

describe("EFMD: EfacturaMdClient pe mock transport (date de test)", () => {
  const client = new EfacturaMdClient({ mock: true });

  it("[blocant] clientul fără credențiale intră automat în mock mode", () => {
    expect(client.isMock).toBe(true);
  });

  it("[blocant] postInvoices acceptă XML-ul și raportează 1 factură postată", async () => {
    const xml = generateSfsInvoiceXml({
      supplierIdno: client.supplierIdno,
      supplierBankAccount: client.supplierBankAccount,
      buyerIdno: "1002600003354",
      deliveryDate: new Date(),
      internalId: "VECT-2026-0042",
      lines: [
        {
          code: "1",
          name: "Abonament lunar",
          unitOfMeasure: "buc",
          quantity: 1,
          unitPriceWithoutVat: 250,
          vatRate: 20,
        },
      ],
    });
    const result = await client.postInvoices(xml, "test-req-1");
    expect(result.status).toBe(2); // executat cu succes
    expect(result.totalInvoicesPosted).toBe(1);
    expect(result.requestId).toBe("test-req-1");
  });

  it("[blocant] checkInvoiceStatus întoarce statusul 7 (Trimis la Cumpărător)", async () => {
    const result = await client.checkInvoiceStatus("EFMD", "000000001", "test-req-2");
    expect(result).not.toBeNull();
    expect(result!.invoiceStatus).toBe(7);
    expect(result!.invoiceStatusLabel).toBe("Trimis la Cumpărător");
  });

  it("seriile de test REJ/ACC simulează refuz și acceptare", async () => {
    const rej = await client.checkInvoiceStatus("REJ1", "000000002", "r1");
    expect(rej!.invoiceStatus).toBe(2);
    const acc = await client.checkInvoiceStatus("ACC1", "000000003", "r2");
    expect(acc!.invoiceStatus).toBe(3);
  });

  it("[blocant] cancelInvoice întoarce ok=true", async () => {
    const result = await client.cancelInvoice("EFMD", "000000001", "dublură", "test-req-3");
    expect(result.ok).toBe(true);
    expect(result.seria).toBe("EFMD");
  });

  it("getTaxpayerInfo validează un IDNO de test", async () => {
    const info = await client.getTaxpayerInfo("1002600004030", "test-req-4");
    expect(info).not.toBeNull();
    expect(info!.idno).toBe("1002600004030");
    expect(info!.isEfacturaActor).toBe(true);
    expect(info!.existsInTaxRegistry).toBe(true);
  });

  it("[blocant] răspunsul SFS cu Status=3 aruncă EfacturaMdError cu mesajul serverului", async () => {
    const failingTransport: SoapTransport = async () =>
      "<R><Status>3</Status><ErrorMessage>XML incorect</ErrorMessage></R>";
    const failing = new EfacturaMdClient({ mock: true }, failingTransport);
    await expect(failing.postInvoices("<Documents/>", "x")).rejects.toThrow(EfacturaMdError);
    await expect(failing.postInvoices("<Documents/>", "x")).rejects.toThrow("XML incorect");
  });
});

// ─── Mapa de statusuri ───────────────────────────────────────────────────────

describe("EFMD: statusurile SFS din ghid (§5.1)", () => {
  it("[blocant] toate cele 9 statusuri documentate există în mapă", () => {
    expect(EFACTURA_MD_STATUS[0]).toBe("Draft");
    expect(EFACTURA_MD_STATUS[1]).toBe("Semnat de Furnizor");
    expect(EFACTURA_MD_STATUS[2]).toBe("Refuzat de Cumpărător");
    expect(EFACTURA_MD_STATUS[3]).toBe("Acceptat de Cumpărător");
    expect(EFACTURA_MD_STATUS[5]).toBe("Anulat de Furnizor");
    expect(EFACTURA_MD_STATUS[6]).toBe("Arhivat");
    expect(EFACTURA_MD_STATUS[7]).toBe("Trimis la Cumpărător");
    expect(EFACTURA_MD_STATUS[8]).toBe("Semnat de Cumpărător");
    expect(EFACTURA_MD_STATUS[10]).toBe("Transportat");
    // 4 și 9 nu există în ghidul SFS
    expect(EFACTURA_MD_STATUS[4]).toBeUndefined();
    expect(EFACTURA_MD_STATUS[9]).toBeUndefined();
  });
});

// ─── Gates structurale (per CLAUDE.md §3.5.1) ───────────────────────────────

describe("EFMD: gates structurale", () => {
  it("[blocant] DB-portability: rutele nu folosesc raw .execute().rows", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "../routes/invoices.ts"),
      "utf-8"
    );
    expect(content).not.toContain(".execute().rows");
  });

  it("[blocant] migrarea 0115 există și e înregistrată în journal", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "../../drizzle/0115_efactura_moldova.sql"),
      "utf-8"
    );
    expect(sql).toContain("efactura_md_seria");
    expect(sql).toContain("efactura_md_status");
    // statement-breakpoint între statement-uri multiple (regula §3.5.1)
    expect(sql.split("--> statement-breakpoint").length).toBeGreaterThanOrEqual(6);

    const journal = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../drizzle/meta/_journal.json"), "utf-8")
    ) as { entries: Array<{ idx: number; tag: string }> };
    const entry = journal.entries.find((e) => e.tag === "0115_efactura_moldova");
    expect(entry).toBeDefined();
    expect(entry!.idx).toBe(115);
    // fără idx duplicat în journal
    const idxs = journal.entries.map((e) => e.idx);
    expect(new Set(idxs).size).toBe(idxs.length);
  });

  it("[blocant] coloanele din migrare sunt declarate și în schema (bidirectional match)", () => {
    const schema = fs.readFileSync(
      path.resolve(__dirname, "../db/schema/invoices.ts"),
      "utf-8"
    );
    for (const col of [
      "efactura_md_seria",
      "efactura_md_number",
      "efactura_md_status",
      "efactura_md_request_id",
      "efactura_md_submitted_at",
      "efactura_md_message",
    ]) {
      expect(schema).toContain(col);
    }
  });

  it("mock transport refuză metodele nesimulate (fail loud, nu fail silent)", async () => {
    const mock = createMockTransport();
    await expect(mock("GetLogs", "<x/>")).rejects.toThrow("metodă nesimulată");
  });
});
