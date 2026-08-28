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
import { parRequests, parPayments, parPayers } from "../db/schema/par";
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

/** Client SFS simulat: întoarce facturile date, exact ca listele reale + XML pe serie/număr. */
function stubClient(invoices: { seria: string; number: string; invoiceStatus: number; xml: string }[]): EfacturaMdClient {
  const heads: InvoiceListItem[] = invoices.map((i) => ({
    seria: i.seria,
    number: i.number,
    invoiceStatus: i.invoiceStatus,
    invoiceStatusLabel: "",
    message: null,
  }));
  return {
    getInvoicesForSigning: async () => heads,
    getAcceptedInvoices: async () => [],
    getInvoicesBySeriaNumber: async (ids: Array<{ seria: string; number: string }>) =>
      ids
        .map((id) => invoices.find((i) => i.seria === id.seria && i.number === id.number))
        .filter((i): i is (typeof invoices)[number] => !!i)
        .map((i) => ({
          seria: i.seria,
          number: i.number,
          invoiceStatus: i.invoiceStatus,
          invoiceStatusLabel: "",
          message: null,
          xml: i.xml,
        })),
  } as unknown as EfacturaMdClient;
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
