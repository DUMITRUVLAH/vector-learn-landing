/**
 * @vitest-environment node
 * PAR-EFP — scanarea SFS chiar RULEAZĂ (nu doar „butonul există"): serviciul primește un client SFS
 * simulat, îi întoarce facturi reale ca XML și se verifică ce ajunge în baza de date.
 *
 * Acoperă cele trei rezultate care contează:
 *   • factura prestatorului există → cererea trece pe „găsită", cu seria/numărul din SFS;
 *   • nu există nimic de la acel furnizor → cererea rămâne în așteptare, dar cu urma verificării;
 *   • o singură factură nu poate acoperi două plăți diferite către același prestator.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parPayments, parPayers, parAttachments } from "../db/schema/par";
import { parEinvoices } from "../db/schema/parEinvoices";
import type { EfacturaMdClient, InvoiceListItem } from "../lib/efacturaMoldova";

let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

const SUPPLIER = "1002600001234";
const BUYER = "1003600009999";

function invoiceXml(params: { supplier: string; buyer: string; date: string; total: string }): string {
  return `<Documents><Document><SupplierInfo>
    <DeliveryDate>${params.date}</DeliveryDate>
    <Supplier IDNO="${params.supplier}"><BankAccount Account="MD24AG000225100013104168" /></Supplier>
    <Buyer IDNO="${params.buyer}" />
    <Merchandises>
      <Row Code="1" Name="Servicii" UnitOfMeasure="buc" Quantity="1" UnitPriceWithoutTVA="1" TotalPriceWithoutTVA="1" TVA="20" TotalTVA="0" TotalPrice="${params.total}" />
    </Merchandises>
  </SupplierInfo></Document></Documents>`;
}

interface StubInvoice {
  seria: string;
  number: string;
  invoiceStatus: number;
  /** XML-ul facturii; gol/absent = cazul real al facturilor ARHIVATE. */
  xml?: string;
  /** Textul QR — singura sursă de furnizor/sumă pentru arhivate. */
  qrText?: string;
  /** În ce listă SFS apare factura. „signed" = starea 8, vizibilă DOAR prin SearchInvoices. */
  bucket?: "signing" | "archived" | "signed" | "hidden";
}

/** Client SFS simulat: întoarce facturile date pe listele reale + XML/QR pe serie/număr. */
function stubClient(invoices: StubInvoice[]): EfacturaMdClient {
  const head = (i: StubInvoice): InvoiceListItem => ({
    seria: i.seria,
    number: i.number,
    invoiceStatus: i.invoiceStatus,
    invoiceStatusLabel: "",
    message: null,
  });
  const find = (ids: Array<{ seria: string; number: string }>) =>
    ids
      .map((id) => invoices.find((i) => i.seria === id.seria && i.number === id.number))
      .filter((i): i is StubInvoice => !!i);
  return {
    getInvoicesForSigning: async () => invoices.filter((i) => (i.bucket ?? "signing") === "signing").map(head),
    getAcceptedInvoices: async () => [],
    getRejectedInvoices: async () => [],
    getArchivedInvoices: async (_r: string, _a: number, _f: Date, _t: Date, page: number) =>
      page === 1 ? invoices.filter((i) => i.bucket === "archived").map(head) : [],
    // Ca SFS-ul real: căutarea întoarce ceva doar cu starea cerută explicit și în perioada cerută.
    searchInvoices: async (
      _r: string,
      _a: number,
      p: { invoiceStatus: number; issuedFrom: Date; issuedTo: Date }
    ) =>
      invoices
        .filter((i) => i.bucket === "signed" && i.invoiceStatus === p.invoiceStatus)
        .filter((i) => {
          const d = /<DeliveryDate>([^<]+)</.exec(i.xml ?? "")?.[1];
          const t = d ? new Date(d).getTime() : NaN;
          return t >= p.issuedFrom.getTime() && t < p.issuedTo.getTime();
        })
        .map(head),
    getInvoicesBySeriaNumber: async (ids: Array<{ seria: string; number: string }>) =>
      find(ids).map((i) => ({ ...head(i), xml: i.xml ?? "" })),
    getInvoiceQrTexts: async (ids: Array<{ seria: string; number: string }>) =>
      find(ids)
        .filter((i) => i.qrText)
        .map((i) => ({ seria: i.seria, number: i.number, text: i.qrText! })),
    // Registrul fiscal: denumirea furnizorului, pentru codurile pe care nu le știm din registrul propriu.
    getTaxpayersInfo: async (idnos: string[]) =>
      idnos.map((idno) => ({
        idno,
        name: `CONTRIBUABIL ${idno}`,
        address: null,
        taxpayerType: 1,
        isEfacturaActor: true,
        existsInTaxRegistry: true,
      })),
  } as unknown as EfacturaMdClient;
}

/** Client care refuză tot — SFS picat / credențiale retrase. */
function brokenClient(): EfacturaMdClient {
  const boom = async () => {
    throw new Error("HTTP 500");
  };
  return {
    getInvoicesForSigning: boom,
    getAcceptedInvoices: boom,
    getRejectedInvoices: boom,
    getArchivedInvoices: boom,
    searchInvoices: boom,
    getInvoicesBySeriaNumber: boom,
    getInvoiceQrTexts: boom,
  } as unknown as EfacturaMdClient;
}


/** Un PDF minim, dar real (cu strat de text), ca extragerea din scanare să ruleze pe bune. */
function textPdfDataUrl(line: string): string {
  const stream = `BT /F1 12 Tf 40 700 Td (${line}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return `data:application/pdf;base64,${Buffer.from(pdf, "latin1").toString("base64")}`;
}

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

let tenantId: string;
let payerId: string;
let requestorId: string;

/** Creează o cerere plătită către prestatorul persoană juridică dat. */
async function paidPar(params: { requestNo: string; idno: string; amountCents: number; paidAt: string }) {
  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      payerId,
      requestNo: params.requestNo,
      requestedByUserId: requestorId,
      purpose: "execute_payment",
      payeeName: "Consultanți SRL",
      payeeIdnp: params.idno,
      payeeType: "juridic",
      currency: "MDL",
      totalEstimatedCents: params.amountCents,
      status: "paid",
      paidAt: new Date(params.paidAt),
    })
    .returning();
  await testDb.insert(parPayments).values({
    tenantId,
    parId: par.id,
    actualAmountCents: params.amountCents,
    paymentDate: new Date(params.paidAt),
  });
  return par.id;
}

beforeEach(async () => {
  const pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: `atic-${Date.now()}` }).returning();
  tenantId = tenant.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC", idno: BUYER }).returning();
  payerId = payer.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "solicitant@atic.example", passwordHash: "x", name: "Solicitant", role: "teacher" })
    .returning();
  requestorId = u.id;
});

describe("scanarea SFS pentru facturile prestatorilor", () => {
  it("găsește factura emisă de prestator și o leagă de cerere", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    const parId = await paidPar({ requestNo: "PAR-1", idno: SUPPLIER, amountCents: 120000, paidAt: "2026-08-12" });

    const result = await scanEfacturasForTenant(
      tenantId,
      undefined,
      stubClient([
        {
          seria: "EFMD",
          number: "000000123",
          invoiceStatus: 7,
          xml: invoiceXml({ supplier: SUPPLIER, buyer: BUYER, date: "2026-08-13T00:00:00.000Z", total: "1200.00" }),
        },
      ])
    );

    expect(result.available).toBe(true);
    expect(result.found).toBe(1);

    const [row] = await testDb.select().from(parEinvoices).where(eq(parEinvoices.parId, parId));
    expect(row.status).toBe("found");
    expect(row.sfsSeria).toBe("EFMD");
    expect(row.sfsNumber).toBe("000000123");
    expect(row.invoiceTotalCents).toBe(120000);
    expect(row.lastScanSource).toBe("sfs");
    expect(row.lastScanMessage).toContain("sumă identică");
  });

  it("lasă cererea în așteptare când în SFS e doar factura altui furnizor", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    const parId = await paidPar({ requestNo: "PAR-2", idno: SUPPLIER, amountCents: 120000, paidAt: "2026-08-12" });

    const result = await scanEfacturasForTenant(
      tenantId,
      undefined,
      stubClient([
        {
          seria: "EFMD",
          number: "000000999",
          invoiceStatus: 7,
          xml: invoiceXml({ supplier: "1009999999999", buyer: BUYER, date: "2026-08-13T00:00:00.000Z", total: "1200.00" }),
        },
      ])
    );

    expect(result.found).toBe(0);
    expect(result.missing).toBe(1);

    const [row] = await testDb.select().from(parEinvoices).where(eq(parEinvoices.parId, parId));
    expect(row.status).toBe("expected");
    expect(row.lastScanAt).not.toBeNull();
    expect(row.lastScanMessage).toContain(SUPPLIER);
  });

  it("nu atribuie aceeași factură la două plăți către același prestator", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    const prima = await paidPar({ requestNo: "PAR-3", idno: SUPPLIER, amountCents: 120000, paidAt: "2026-08-10" });
    const aDoua = await paidPar({ requestNo: "PAR-4", idno: SUPPLIER, amountCents: 120000, paidAt: "2026-08-20" });

    const result = await scanEfacturasForTenant(
      tenantId,
      undefined,
      stubClient([
        {
          seria: "EFMD",
          number: "000000123",
          invoiceStatus: 7,
          xml: invoiceXml({ supplier: SUPPLIER, buyer: BUYER, date: "2026-08-11T00:00:00.000Z", total: "1200.00" }),
        },
      ])
    );

    expect(result.found).toBe(1);
    const rows = await testDb.select().from(parEinvoices).where(eq(parEinvoices.tenantId, tenantId));
    expect(rows.find((r) => r.parId === prima)!.status).toBe("found");
    expect(rows.find((r) => r.parId === aDoua)!.status).toBe("expected");
  });

  it("nu consideră dovadă o factură refuzată de cumpărător", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    const parId = await paidPar({ requestNo: "PAR-5", idno: SUPPLIER, amountCents: 120000, paidAt: "2026-08-12" });

    await scanEfacturasForTenant(
      tenantId,
      undefined,
      stubClient([
        {
          seria: "EFMD",
          number: "000000321",
          invoiceStatus: 2, // Refuzat de Cumpărător
          xml: invoiceXml({ supplier: SUPPLIER, buyer: BUYER, date: "2026-08-13T00:00:00.000Z", total: "1200.00" }),
        },
      ])
    );

    const [row] = await testDb
      .select()
      .from(parEinvoices)
      .where(and(eq(parEinvoices.tenantId, tenantId), eq(parEinvoices.parId, parId)));
    expect(row.status).toBe("expected");
  });

  it("fără credențiale SFS nu atinge starea și raportează indisponibilitatea", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    const parId = await paidPar({ requestNo: "PAR-6", idno: SUPPLIER, amountCents: 120000, paidAt: "2026-08-12" });

    const result = await scanEfacturasForTenant(tenantId);
    expect(result.available).toBe(false);

    const [row] = await testDb.select().from(parEinvoices).where(eq(parEinvoices.parId, parId));
    expect(row.status).toBe("expected");
    expect(row.lastScanAt).toBeNull();
  });
});

describe("lista brută a facturilor primite (tabul Toate e-Facturile)", () => {
  it("arată facturile din SFS și le leagă de cererea potrivită", async () => {
    const { scanEfacturasForTenant, listBuyerInvoicesForTenant } = await import("../services/par/efacturaScan");
    const parId = await paidPar({ requestNo: "PAR-7", idno: SUPPLIER, amountCents: 120000, paidAt: "2026-08-12" });
    const client = stubClient([
      {
        seria: "EFMD",
        number: "000000123",
        invoiceStatus: 7,
        xml: invoiceXml({ supplier: SUPPLIER, buyer: BUYER, date: "2026-08-13T00:00:00.000Z", total: "1200.00" }),
      },
      {
        // Factură fără PAR în spate (abonament) — trebuie să apară oricum în listă.
        seria: "EFMD",
        number: "000000777",
        invoiceStatus: 3,
        xml: invoiceXml({ supplier: "1009999999999", buyer: BUYER, date: "2026-08-20T00:00:00.000Z", total: "300.00" }),
      },
    ]);

    await scanEfacturasForTenant(tenantId, undefined, client);
    // Lista NU mai interoghează SFS: citește ce a salvat scanarea în copia locală.
    const list = await listBuyerInvoicesForTenant(tenantId);

    expect(list.available).toBe(true);
    expect(list.invoices).toHaveLength(2);
    // Cele mai noi primele.
    expect(list.invoices[0].number).toBe("000000777");
    const legata = list.invoices.find((i) => i.number === "000000123")!;
    expect(legata.linkedParId).toBe(parId);
    expect(legata.linkedRequestNo).toBe("PAR-7");
    expect(legata.totalCents).toBe(120000);
    const fara = list.invoices.find((i) => i.number === "000000777")!;
    expect(fara.linkedParId).toBeNull();
  });

  it("fără credențiale SFS spune că nu poate citi, în loc să arate o listă goală ca adevăr", async () => {
    const { listBuyerInvoicesForTenant } = await import("../services/par/efacturaScan");
    const list = await listBuyerInvoicesForTenant(tenantId);
    expect(list.available).toBe(false);
    expect(list.invoices).toHaveLength(0);
    expect(list.message).toMatch(/nu este configurat|simulat/i);
  });
});

describe("facturile arhivate — cazul contului real", () => {
  // Pe contul VECTOR ACADEMY, listele „de semnat"/„acceptate" erau GOALE, iar cele 45 de facturi
  // primite stăteau în arhivă, cu XML gol: singurele date veneau din textul QR. Ecranul arăta
  // „Nicio factură primită în SFS" pe un cont plin.
  const QR = (supplier: string, total: string) =>
    `EAW 000504087 Furn-${supplier} Cump-${BUYER} Suma totala-${total}lei Suma TVA- 0lei https://efactura.sfs.md:443/EFactura.aspx?id=abc`;

  it("le include în listă, cu furnizor, sumă și link din codul QR", async () => {
    const { listBuyerInvoicesForTenant } = await import("../services/par/efacturaScan");
    const { syncBuyerInvoices } = await import("../services/par/efacturaCache");
    await syncBuyerInvoices(tenantId, {
      client: stubClient([
        { seria: "EAW", number: "000504087", invoiceStatus: 6, bucket: "archived", qrText: QR(SUPPLIER, "1200.00") },
      ]),
      pauseMs: 0,
      ignoreLock: true,
    });
    const list = await listBuyerInvoicesForTenant(tenantId);

    expect(list.available).toBe(true);
    expect(list.invoices).toHaveLength(1);
    expect(list.invoices[0].supplierIdno).toBe(SUPPLIER);
    expect(list.invoices[0].totalCents).toBe(120000);
    expect(list.invoices[0].portalUrl).toContain("EFactura.aspx");
    // Codul fiscal singur nu spune nimic unui om: denumirea vine din registrul fiscal.
    expect(list.invoices[0].supplierName).toBe(`CONTRIBUABIL ${SUPPLIER}`);
  });

  it("le folosește și la potrivirea cu plata", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    const parId = await paidPar({ requestNo: "PAR-8", idno: SUPPLIER, amountCents: 120000, paidAt: "2026-08-12" });

    const result = await scanEfacturasForTenant(
      tenantId,
      undefined,
      stubClient([
        { seria: "EAW", number: "000504087", invoiceStatus: 6, bucket: "archived", qrText: QR(SUPPLIER, "1200.00") },
      ])
    );

    expect(result.found).toBe(1);
    const [row] = await testDb.select().from(parEinvoices).where(eq(parEinvoices.parId, parId));
    expect(row.status).toBe("found");
    expect(row.sfsNumber).toBe("000504087");
  });
});

describe("când SFS refuză toate listele", () => {
  it("scanarea nu marchează nimic drept verificat", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    const parId = await paidPar({ requestNo: "PAR-9", idno: SUPPLIER, amountCents: 120000, paidAt: "2026-08-12" });

    const result = await scanEfacturasForTenant(tenantId, undefined, brokenClient());
    expect(result.available).toBe(false);
    expect(result.message).toMatch(/nu am putut interoga sfs/i);

    const [row] = await testDb.select().from(parEinvoices).where(eq(parEinvoices.parId, parId));
    expect(row.lastScanAt).toBeNull();
    expect(row.status).toBe("expected");
  });

  it("lista brută spune că nu a putut citi, nu că nu există facturi", async () => {
    const { listBuyerInvoicesForTenant } = await import("../services/par/efacturaScan");
    const { syncBuyerInvoices } = await import("../services/par/efacturaCache");
    await syncBuyerInvoices(tenantId, { client: brokenClient(), pauseMs: 0, ignoreLock: true });
    const list = await listBuyerInvoicesForTenant(tenantId);
    expect(list.available).toBe(false);
    expect(list.invoices).toHaveLength(0);
    expect(list.message).toMatch(/nu am putut citi/i);
  });
});

describe("mesajul de eroare când SFS e picat", () => {
  it("nu repetă aceeași cauză o dată pentru fiecare listă", async () => {
    const { formatSfsErrors } = await import("../services/par/efacturaScan");
    const cauza = "HTTP 500 — serviciul SFS nu răspunde";
    const out = formatSfsErrors([
      `facturi de semnat: e-Factura MD GetInvoicesForSigning: ${cauza}`,
      `facturi acceptate: e-Factura MD GetAcceptedInvoices: ${cauza}`,
      `facturi arhivate: e-Factura MD GetArchivedInvoices: ${cauza}`,
      `facturi respinse: e-Factura MD GetRejectedInvoices: ${cauza}`,
    ]);

    expect(out).toBe(`facturi de semnat, facturi acceptate, facturi arhivate, facturi respinse: ${cauza}`);
    expect(out.match(/HTTP 500/g)).toHaveLength(1);
  });

  it("păstrează separat cauzele diferite", async () => {
    const { formatSfsErrors } = await import("../services/par/efacturaScan");
    const out = formatSfsErrors([
      "facturi de semnat: e-Factura MD GetInvoicesForSigning: HTTP 500 — serviciul SFS nu răspunde",
      "facturi arhivate: e-Factura MD GetArchivedInvoices: drepturi insuficiente",
    ]);

    expect(out).toBe(
      "facturi de semnat: HTTP 500 — serviciul SFS nu răspunde; facturi arhivate: drepturi insuficiente"
    );
  });
});

describe("facturile din ultimul an — cazul ATIC (2026-09-25)", () => {
  // Pe contul real, facturile procesate în ultimele ~12 luni stau în starea 8 „Semnat de Cumpărător"
  // și NU apar în nicio listă SFS. Ecranul arăta 27 de cereri pe „Lipsește", deși furnizorii
  // emiseseră facturile (EBM000267772, EBK000758854 … toate în starea 8).

  it("găsește factura în starea 8, vizibilă doar prin căutarea după stare", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    const parId = await paidPar({ requestNo: "PAR-S8", idno: SUPPLIER, amountCents: 59400, paidAt: "2026-09-23" });

    const result = await scanEfacturasForTenant(
      tenantId,
      undefined,
      stubClient([
        {
          seria: "EBM",
          number: "000267772",
          invoiceStatus: 8,
          bucket: "signed",
          xml: invoiceXml({ supplier: SUPPLIER, buyer: BUYER, date: "2026-09-16T16:32:07.000Z", total: "594.00" }),
        },
      ])
    );

    expect(result.found).toBe(1);
    const [row] = await testDb.select().from(parEinvoices).where(eq(parEinvoices.parId, parId));
    expect(row.status).toBe("found");
    expect(row.sfsNumber).toBe("000267772");
    expect(row.sfsInvoiceStatus).toBe(8);
  });

  it("confirmă e-Factura ATAȘATĂ la cerere, chiar emisă cu luni înainte de plată", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    // Auditul ATIC: factura EBH000518484 din 23.04, plătită pe 15.09 — în afara ferestrei de potrivire.
    const parId = await paidPar({ requestNo: "PAR-AT", idno: SUPPLIER, amountCents: 7000000, paidAt: "2026-09-15" });
    await testDb.insert(parAttachments).values({
      tenantId,
      parId,
      fileName: "EBH000518484.pdf",
      fileUrl: "storage://par-attachments/x/EBH000518484.pdf",
      kind: "invoice",
    });

    const result = await scanEfacturasForTenant(
      tenantId,
      undefined,
      stubClient([
        {
          seria: "EBH",
          number: "000518484",
          invoiceStatus: 8,
          bucket: "hidden", // nu apare în nicio listă și e în afara perioadei căutate
          xml: invoiceXml({ supplier: SUPPLIER, buyer: BUYER, date: "2026-04-23T08:42:44.000Z", total: "70000.00" }),
        },
      ])
    );

    expect(result.found).toBe(1);
    const [row] = await testDb.select().from(parEinvoices).where(eq(parEinvoices.parId, parId));
    expect(row.status).toBe("found");
    expect(row.sfsSeria).toBe("EBH");
    expect(row.lastScanMessage).toContain("indicată în cerere");
  });

  it("nu confirmă o factură atașată emisă de alt cod fiscal, dar spune exact ce diferă", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    // Deea House: registrul are 1014600000674, SFS are 1014600006741.
    const parId = await paidPar({ requestNo: "PAR-DH", idno: "1014600000674", amountCents: 340000, paidAt: "2026-09-17" });
    await testDb.insert(parAttachments).values({
      tenantId,
      parId,
      fileName: "EBL000116890.pdf",
      fileUrl: "storage://par-attachments/x/EBL000116890.pdf",
      kind: "invoice",
    });

    await scanEfacturasForTenant(
      tenantId,
      undefined,
      stubClient([
        {
          seria: "EBL",
          number: "000116890",
          invoiceStatus: 8,
          bucket: "hidden",
          xml: invoiceXml({ supplier: "1014600006741", buyer: BUYER, date: "2026-08-11T23:01:01.000Z", total: "3400.00" }),
        },
      ])
    );

    const [row] = await testDb.select().from(parEinvoices).where(eq(parEinvoices.parId, parId));
    expect(row.status).toBe("expected");
    expect(row.lastScanMessage).toContain("1014600006741");
    expect(row.lastScanMessage).toContain("1014600000674");
  });

  it("citește factura și din descrierea cererii; aceeași factură nu acoperă două plăți", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    // NEWS MAKER: PAR-0003 are PDF-ul atașat, PAR-0008 scrie numărul doar în descriere — aceeași
    // factură plătită de două ori. A doua trebuie să rămână deschisă, cu motivul spus.
    const prima = await paidPar({ requestNo: "PAR-NM1", idno: SUPPLIER, amountCents: 150851, paidAt: "2026-09-02" });
    const aDoua = await paidPar({ requestNo: "PAR-NM2", idno: SUPPLIER, amountCents: 125700, paidAt: "2026-09-03" });
    await testDb.insert(parAttachments).values({ tenantId, parId: prima, fileName: "EBK000758854.pdf", kind: "invoice" });
    await testDb
      .update(parRequests)
      .set({ endUse: "Servicii conform facturii cu nr. EBK000758854, emise pe 31.07.2026" })
      .where(eq(parRequests.id, aDoua));

    await scanEfacturasForTenant(
      tenantId,
      undefined,
      stubClient([
        {
          seria: "EBK",
          number: "000758854",
          invoiceStatus: 8,
          bucket: "hidden",
          xml: invoiceXml({ supplier: SUPPLIER, buyer: BUYER, date: "2026-07-31T14:16:29.000Z", total: "1508.51" }),
        },
      ])
    );

    const rows = await testDb.select().from(parEinvoices).where(eq(parEinvoices.tenantId, tenantId));
    expect(rows.find((r) => r.parId === prima)!.status).toBe("found");
    const second = rows.find((r) => r.parId === aDoua)!;
    expect(second.status).toBe("expected");
    expect(second.lastScanMessage).toContain("deja legată de altă cerere");
  });

  it("găsește factura după DENUMIRE când codul fiscal din cerere e greșit, dar doar cu suma identică", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    // Deea House, PAR-0046: registrul are 1014600000674, SFS are 1014600006741; EBM000000354 = 3.795,00.
    const exact = await paidPar({ requestNo: "PAR-DH2", idno: "1014600000674", amountCents: 379500, paidAt: "2026-09-17" });
    const altaSuma = await paidPar({ requestNo: "PAR-DH3", idno: "1014600000674", amountCents: 50000, paidAt: "2026-09-17" });
    await testDb.update(parRequests).set({ payeeName: "Deea House SRL" }).where(eq(parRequests.tenantId, tenantId));
    const titled = (xml: string) => xml.replace('<Supplier IDNO="1014600006741"', '<Supplier IDNO="1014600006741" Title="&quot;DEEA HOUSE&quot; S.R.L."');

    await scanEfacturasForTenant(
      tenantId,
      undefined,
      stubClient([
        {
          seria: "EBM",
          number: "000000354",
          invoiceStatus: 8,
          bucket: "signed",
          xml: titled(invoiceXml({ supplier: "1014600006741", buyer: BUYER, date: "2026-09-08T00:00:00.000Z", total: "3795.00" })),
        },
      ])
    );

    const rows = await testDb.select().from(parEinvoices).where(eq(parEinvoices.tenantId, tenantId));
    const ok = rows.find((r) => r.parId === exact)!;
    expect(ok.status).toBe("found");
    expect(ok.sfsNumber).toBe("000000354");
    expect(ok.lastScanMessage).toContain("1014600006741");
    expect(ok.lastScanMessage).toContain("corectează prestatorul");
    expect(rows.find((r) => r.parId === altaSuma)!.status).toBe("expected");
  });

  it("factura fiscală atașată, emisă în afara SFS (Moldcell „MM”), nu mai apare „Lipsește”", async () => {
    const { scanEfacturasForTenant } = await import("../services/par/efacturaScan");
    const moldcell = await paidPar({ requestNo: "PAR-MC", idno: "1002600046027", amountCents: 9100, paidAt: "2026-09-18" });
    const contDePlata = await paidPar({ requestNo: "PAR-BTS", idno: "1008600061565", amountCents: 430075, paidAt: "2026-09-17" });
    await testDb.insert(parAttachments).values([
      {
        tenantId,
        parId: moldcell,
        fileName: "20260810066000349271006600034927_202608_MM8705846.signed.pdf",
        fileUrl: textPdfDataUrl("Factura fiscala Seria, Nr. MM 8705846 Servicii comunicatii electronice 2729.18"),
        mimeType: "application/pdf",
        kind: "invoice",
      },
      {
        tenantId,
        parId: contDePlata,
        fileName: "cont.pdf",
        fileUrl: textPdfDataUrl("CONT DE PLATA nr. 00005996150 din 15 septembrie 2026 Factura fiscala va urma"),
        mimeType: "application/pdf",
        kind: "invoice",
      },
    ]);

    const result = await scanEfacturasForTenant(tenantId, undefined, stubClient([]));

    const rows = await testDb.select().from(parEinvoices).where(eq(parEinvoices.tenantId, tenantId));
    const mc = rows.find((r) => r.parId === moldcell)!;
    expect(mc.status).toBe("received_manual");
    expect(mc.lastScanSource).toBe("attachment");
    expect(mc.markedNote).toContain("MM");
    expect(mc.markedNote).toContain("8705846");
    // Un cont de plată nu e factură fiscală: rămâne de urmărit.
    expect(rows.find((r) => r.parId === contDePlata)!.status).toBe("expected");
    expect(result.message).toContain("în afara SFS");
  });

  it("nu așteaptă e-Factura când beneficiarul e chiar organizația plătitoare", async () => {
    const { syncEfacturaCandidates } = await import("../services/par/efacturaScan");
    const parId = await paidPar({ requestNo: "PAR-CARD", idno: BUYER, amountCents: 10000, paidAt: "2026-09-15" });

    await syncEfacturaCandidates(tenantId);

    const [row] = await testDb.select().from(parEinvoices).where(eq(parEinvoices.parId, parId));
    expect(row.status).toBe("not_applicable");
  });
});
