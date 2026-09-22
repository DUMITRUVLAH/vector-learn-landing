/**
 * @vitest-environment node
 * PAR-EFP — citirea în loturi a facturilor din SFS, pe PGlite, cu migrările aplicate.
 *
 * Aici se blochează la loc bug-ul pentru care s-a făcut tabela (CLAUDE.md §3.5.1quater): ecranul
 * re-citea TOT istoricul la fiecare deschidere, se oprea la primele 200 de facturi din cauza
 * plafonului de timp, iar restul nu se citeau niciodată. Testele rulează sincronizarea ADEVĂRATĂ
 * cu un client SFS simulat care NUMĂRĂ apelurile, și verifică:
 *   • o factură se cere din SFS o SINGURĂ dată, oricâte loturi ar fi;
 *   • un lot întrerupt de buget se reia de unde a rămas (cursorul de arhivă e persistat);
 *   • după recuperarea istoricului, sincronizarea următoare nu mai plimbă toată arhiva;
 *   • filtrele (perioadă, furnizor) și sortările citesc din copia locală, fără SFS;
 *   • când SFS refuză, răspunsul NU e „nu există facturi".
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants } from "../db/schema";
import { parSfsInvoices, parSfsSyncState } from "../db/schema/parSfsInvoices";
import type { EfacturaMdClient, InvoiceListItem } from "../lib/efacturaMoldova";

let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

const BUYER = "1003600009999";

/** O factură de test: serie/număr + furnizor + dată + sumă, exact ca în XML-ul SFS. */
interface Fake {
  seria: string;
  number: string;
  supplier: string;
  date: Date;
  totalCents: number;
  /** Unde stă factura: în lista „de semnat" sau în arhivă (cazul obișnuit pe conturi reale). */
  bucket: "signing" | "archived";
}

function xmlFor(f: Fake): string {
  return `<Documents><Document><SupplierInfo>
    <DeliveryDate>${f.date.toISOString()}</DeliveryDate>
    <Supplier IDNO="${f.supplier}"><BankAccount Account="MD24AG000225100013104168" /></Supplier>
    <Buyer IDNO="${BUYER}" />
    <Merchandises>
      <Row Code="1" Name="Servicii" UnitOfMeasure="buc" Quantity="1" UnitPriceWithoutTVA="1" TotalPriceWithoutTVA="1" TVA="20" TotalTVA="0" TotalPrice="${(
        f.totalCents / 100
      ).toFixed(2)}" />
    </Merchandises>
  </SupplierInfo></Document></Documents>`;
}

interface Recorder {
  client: EfacturaMdClient;
  /** Fiecare cheie „SERIE|NUMĂR" cerută la GetInvoicesBySeriaNumber, în ordine (cu duplicate). */
  detailKeys: string[];
  /** Ferestrele de arhivă cerute: `from→to#pagină`. */
  archiveWindows: string[];
  liveCalls: number;
}

/** Client SFS simulat care ține evidența apelurilor + poate încetini fiecare apel. */
function recordingClient(invoices: Fake[], opts: { delayMs?: number; pageSize?: number } = {}): Recorder {
  const delay = opts.delayMs ?? 0;
  const pageSize = opts.pageSize ?? 20;
  const rec: Recorder = { client: null as unknown as EfacturaMdClient, detailKeys: [], archiveWindows: [], liveCalls: 0 };
  const head = (f: Fake): InvoiceListItem => ({
    seria: f.seria,
    number: f.number,
    invoiceStatus: f.bucket === "archived" ? 6 : 7,
    invoiceStatusLabel: "",
    message: null,
  });
  const wait = async () => {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  };

  rec.client = {
    getInvoicesForSigning: async () => {
      rec.liveCalls++;
      await wait();
      return invoices.filter((i) => i.bucket === "signing").map(head);
    },
    getAcceptedInvoices: async () => {
      await wait();
      return [];
    },
    getRejectedInvoices: async () => {
      await wait();
      return [];
    },
    getArchivedInvoices: async (_r: string, _a: number, from: Date, to: Date, page: number) => {
      rec.archiveWindows.push(`${from.toISOString()}→${to.toISOString()}#${page}`);
      await wait();
      const inWindow = invoices.filter(
        (i) => i.bucket === "archived" && i.date >= from && i.date <= to
      );
      return inWindow.slice((page - 1) * pageSize, page * pageSize).map(head);
    },
    getInvoicesBySeriaNumber: async (ids: Array<{ seria: string; number: string }>) => {
      for (const id of ids) rec.detailKeys.push(`${id.seria}|${id.number}`);
      await wait();
      return ids
        .map((id) => invoices.find((i) => i.seria === id.seria && i.number === id.number))
        .filter((f): f is Fake => !!f)
        .map((f) => ({ ...head(f), xml: xmlFor(f) }));
    },
    getInvoiceQrTexts: async () => {
      await wait();
      return [];
    },
    getTaxpayersInfo: async (idnos: string[]) =>
      idnos.map((idno) => ({
        idno,
        name: `FURNIZOR ${idno}`,
        address: null,
        taxpayerType: 1,
        isEfacturaActor: true,
        existsInTaxRegistry: true,
      })),
  } as unknown as EfacturaMdClient;
  return rec;
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
    getInvoicesBySeriaNumber: boom,
    getInvoiceQrTexts: boom,
    getTaxpayersInfo: boom,
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
let tenantSeq = 0;

// Migrările costă secunde bune pe PGlite: le aplicăm O DATĂ. Izolarea între teste vine din
// faptul că tot ce scriem e legat de tenant — fiecare test primește un workspace nou.
beforeAll(async () => {
  const pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });
});

beforeEach(async () => {
  const [tenant] = await testDb
    .insert(tenants)
    .values({ name: "ATIC", slug: `atic-${++tenantSeq}-${Date.now()}` })
    .returning();
  tenantId = tenant.id;
});

/** Generează facturi eșalonate în trecut, câte una la `daysApart` zile. */
function makeInvoices(count: number, opts: { daysApart?: number; supplier?: string; bucket?: Fake["bucket"] } = {}): Fake[] {
  const daysApart = opts.daysApart ?? 7;
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    seria: "EAW",
    number: String(100000 + i),
    supplier: opts.supplier ?? (i % 2 === 0 ? "1002600001234" : "1009999999999"),
    date: new Date(now - (i + 1) * daysApart * 24 * 60 * 60 * 1000),
    totalCents: 10000 + i * 100,
    bucket: opts.bucket ?? "archived",
  }));
}

/** Rulează loturi până la capăt (ca bucla din interfață), cu plafon de siguranță. */
async function syncUntilDone(
  client: EfacturaMdClient,
  options: { budgetMs?: number; maxBatches?: number } = {}
): Promise<number> {
  const { syncBuyerInvoices } = await import("../services/par/efacturaCache");
  const max = options.maxBatches ?? 40;
  for (let i = 1; i <= max; i++) {
    const res = await syncBuyerInvoices(tenantId, {
      client,
      pauseMs: 0,
      ignoreLock: true,
      budgetMs: options.budgetMs ?? 5_000,
    });
    if (res.progress.done) return i;
  }
  return max;
}

describe("citirea în loturi din SFS", () => {
  it("salvează toate facturile și cere fiecare detaliu O SINGURĂ dată", async () => {
    const { listCachedInvoices, getSyncProgress } = await import("../services/par/efacturaCache");
    const invoices = makeInvoices(60);
    const rec = recordingClient(invoices);

    await syncUntilDone(rec.client);

    const progress = await getSyncProgress(tenantId);
    expect(progress.total).toBe(60);
    expect(progress.detailed).toBe(60);
    expect(progress.pending).toBe(0);
    expect(progress.done).toBe(true);

    // Nicio factură cerută de două ori — exact risipa care făcea ecranul să se blocheze.
    expect(rec.detailKeys).toHaveLength(new Set(rec.detailKeys).size);
    expect(rec.detailKeys).toHaveLength(60);

    const page = await listCachedInvoices(tenantId, { pageSize: 100 });
    expect(page.total).toBe(60);
    expect(page.items.every((i) => i.detailsRead)).toBe(true);
    expect(page.items.every((i) => i.supplierIdno && i.invoiceDate && i.totalCents)).toBe(true);
  });

  it("un lot întrerupt de buget se reia de unde a rămas, fără să repete ce a citit", async () => {
    const { syncBuyerInvoices, getSyncProgress } = await import("../services/par/efacturaCache");
    const rec = recordingClient(makeInvoices(40), { delayMs: 12 });

    // Buget mic: primul lot NU are cum să termine tot.
    const first = await syncBuyerInvoices(tenantId, { client: rec.client, pauseMs: 0, ignoreLock: true, budgetMs: 150 });
    expect(first.progress.done).toBe(false);
    const afterFirst = await getSyncProgress(tenantId);

    await syncUntilDone(rec.client, { budgetMs: 5_000 });

    const final = await getSyncProgress(tenantId);
    expect(final.total).toBe(40);
    expect(final.detailed).toBe(40);
    expect(final.done).toBe(true);
    // Lotul al doilea a continuat, nu a luat-o de la capăt.
    expect(afterFirst.total).toBeLessThanOrEqual(final.total);
    expect(rec.detailKeys).toHaveLength(new Set(rec.detailKeys).size);
  });

  it("după recuperarea istoricului nu mai plimbă toată arhiva la fiecare sincronizare", async () => {
    const { syncBuyerInvoices } = await import("../services/par/efacturaCache");
    const rec = recordingClient(makeInvoices(20, { daysApart: 30 }));

    await syncUntilDone(rec.client);
    const windowsAfterBackfill = rec.archiveWindows.length;
    const detailsAfterBackfill = rec.detailKeys.length;
    expect(windowsAfterBackfill).toBeGreaterThan(1); // istoricul s-a parcurs fereastră cu fereastră

    // O sincronizare ulterioară („Verifică noutățile"): doar fereastra recentă, zero detalii noi.
    const again = await syncBuyerInvoices(tenantId, {
      client: rec.client,
      pauseMs: 0,
      ignoreLock: true,
      force: true,
    });
    expect(again.progress.done).toBe(true);
    expect(rec.detailKeys).toHaveLength(detailsAfterBackfill);
    expect(rec.archiveWindows.length - windowsAfterBackfill).toBeLessThanOrEqual(2);
  });

  it("o factură nouă apărută în SFS intră în copia locală fără să atingă restul", async () => {
    const { syncBuyerInvoices, listCachedInvoices } = await import("../services/par/efacturaCache");
    const invoices = makeInvoices(5, { daysApart: 3 });
    const rec = recordingClient(invoices);
    await syncUntilDone(rec.client);
    const before = rec.detailKeys.length;

    invoices.push({
      seria: "EAW",
      number: "999999",
      supplier: "1002600001234",
      date: new Date(),
      totalCents: 55500,
      bucket: "signing",
    });
    await syncBuyerInvoices(tenantId, { client: rec.client, pauseMs: 0, ignoreLock: true, force: true });

    const page = await listCachedInvoices(tenantId, { pageSize: 100 });
    expect(page.total).toBe(6);
    expect(page.items.find((i) => i.number === "999999")?.totalCents).toBe(55500);
    // S-a cerut DOAR factura nouă.
    expect(rec.detailKeys.slice(before)).toEqual(["EAW|999999"]);
  });

  it("nu pornește o a doua sincronizare cât timp una rulează", async () => {
    const { syncBuyerInvoices } = await import("../services/par/efacturaCache");
    const rec = recordingClient(makeInvoices(3));
    // Prima rulare creează rândul de stare; apoi simulăm un lot în curs.
    await syncBuyerInvoices(tenantId, { client: rec.client, pauseMs: 0, ignoreLock: true, budgetMs: 100 });
    await testDb
      .update(parSfsSyncState)
      .set({ runningSince: new Date() })
      .where(eq(parSfsSyncState.tenantId, tenantId));

    const second = await syncBuyerInvoices(tenantId, { client: rec.client, pauseMs: 0 });
    expect(second.busy).toBe(true);
    expect(second.discovered).toBe(0);
  });
});

describe("filtrare și sortare pe copia locală", () => {
  beforeEach(async () => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const rec = recordingClient([
      { seria: "EAW", number: "1", supplier: "1002600001234", date: new Date(now - 2 * day), totalCents: 30000, bucket: "signing" },
      { seria: "EAW", number: "2", supplier: "1002600001234", date: new Date(now - 40 * day), totalCents: 10000, bucket: "archived" },
      { seria: "EBB", number: "3", supplier: "1009999999999", date: new Date(now - 300 * day), totalCents: 70000, bucket: "archived" },
    ]);
    await syncUntilDone(rec.client);
  });

  it("filtrează pe perioadă", async () => {
    const { listCachedInvoices } = await import("../services/par/efacturaCache");
    const day = 24 * 60 * 60 * 1000;
    const recent = await listCachedInvoices(tenantId, { from: new Date(Date.now() - 10 * day) });
    expect(recent.items.map((i) => i.number)).toEqual(["1"]);
    expect(recent.total).toBe(1);

    const mid = await listCachedInvoices(tenantId, {
      from: new Date(Date.now() - 60 * day),
      to: new Date(Date.now() - 10 * day),
    });
    expect(mid.items.map((i) => i.number)).toEqual(["2"]);
  });

  it("filtrează pe furnizor și însumează doar ce s-a filtrat", async () => {
    const { listCachedInvoices, listSupplierFacets } = await import("../services/par/efacturaCache");
    const one = await listCachedInvoices(tenantId, { supplier: "1002600001234" });
    expect(one.total).toBe(2);
    expect(one.totalCents).toBe(40000);

    const facets = await listSupplierFacets(tenantId);
    expect(facets.find((f) => f.idno === "1002600001234")?.count).toBe(2);
    // Denumirea vine din registrul fiscal, ca tabelul să nu arate doar coduri.
    expect(facets.find((f) => f.idno === "1002600001234")?.name).toContain("FURNIZOR");
  });

  it("sortează după dată și după sumă, în ambele sensuri", async () => {
    const { listCachedInvoices } = await import("../services/par/efacturaCache");
    const newest = await listCachedInvoices(tenantId, { sort: "date_desc" });
    expect(newest.items.map((i) => i.number)).toEqual(["1", "2", "3"]);

    const oldest = await listCachedInvoices(tenantId, { sort: "date_asc" });
    expect(oldest.items.map((i) => i.number)).toEqual(["3", "2", "1"]);

    const big = await listCachedInvoices(tenantId, { sort: "amount_desc" });
    expect(big.items.map((i) => i.totalCents)).toEqual([70000, 30000, 10000]);

    const small = await listCachedInvoices(tenantId, { sort: "amount_asc" });
    expect(small.items.map((i) => i.totalCents)).toEqual([10000, 30000, 70000]);
  });

  it("caută după serie, număr sau cod fiscal", async () => {
    const { listCachedInvoices } = await import("../services/par/efacturaCache");
    expect((await listCachedInvoices(tenantId, { q: "EBB" })).total).toBe(1);
    expect((await listCachedInvoices(tenantId, { q: "1009999999999" })).total).toBe(1);
  });

  it("paginează fără să piardă totalul", async () => {
    const { listCachedInvoices } = await import("../services/par/efacturaCache");
    const p1 = await listCachedInvoices(tenantId, { pageSize: 2, page: 1 });
    const p2 = await listCachedInvoices(tenantId, { pageSize: 2, page: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p2.items).toHaveLength(1);
    expect(p1.total).toBe(3);
    expect(p2.total).toBe(3);
  });
});

describe("când SFS nu răspunde", () => {
  it("sincronizarea raportează indisponibilitatea și nu inventează facturi", async () => {
    const { syncBuyerInvoices, getSyncProgress } = await import("../services/par/efacturaCache");
    const res = await syncBuyerInvoices(tenantId, { client: brokenClient(), pauseMs: 0, ignoreLock: true });
    expect(res.available).toBe(false);
    expect(res.discovered).toBe(0);
    const progress = await getSyncProgress(tenantId);
    expect(progress.total).toBe(0);
    expect(progress.lastError).toMatch(/500/);
  });

  it("lista spune că nu a putut citi, în loc să arate lista goală ca adevăr", async () => {
    const { syncBuyerInvoices } = await import("../services/par/efacturaCache");
    const { listBuyerInvoicesForTenant } = await import("../services/par/efacturaScan");
    await syncBuyerInvoices(tenantId, { client: brokenClient(), pauseMs: 0, ignoreLock: true });

    const list = await listBuyerInvoicesForTenant(tenantId);
    expect(list.available).toBe(false);
    expect(list.invoices).toHaveLength(0);
    expect(list.message).toMatch(/nu am putut citi|nu este configurat/i);
  });

  it("păstrează facturile deja salvate chiar dacă SFS pică ulterior", async () => {
    const { syncBuyerInvoices, listCachedInvoices } = await import("../services/par/efacturaCache");
    const rec = recordingClient(makeInvoices(4));
    await syncUntilDone(rec.client);

    await syncBuyerInvoices(tenantId, { client: brokenClient(), pauseMs: 0, ignoreLock: true, force: true });

    const page = await listCachedInvoices(tenantId, { pageSize: 100 });
    expect(page.total).toBe(4);
    expect(page.items.every((i) => i.detailsRead)).toBe(true);
  });
});

describe("copia locală rămâne consistentă", () => {
  it("o re-sincronizare nu șterge detaliile deja citite", async () => {
    const { syncBuyerInvoices } = await import("../services/par/efacturaCache");
    const rec = recordingClient(makeInvoices(3, { daysApart: 2 }));
    await syncUntilDone(rec.client);

    const before = await testDb
      .select()
      .from(parSfsInvoices)
      .where(eq(parSfsInvoices.tenantId, tenantId));
    await syncBuyerInvoices(tenantId, { client: rec.client, pauseMs: 0, ignoreLock: true, force: true });
    const after = await testDb
      .select()
      .from(parSfsInvoices)
      .where(eq(parSfsInvoices.tenantId, tenantId));

    expect(after).toHaveLength(before.length);
    expect(after.every((r) => r.detailsFetchedAt !== null)).toBe(true);
    expect(after.every((r) => r.supplierIdno !== null)).toBe(true);
  });

  it("ștergerea copiei locale reia citirea de la zero", async () => {
    const { resetInvoiceCache, getSyncProgress } = await import("../services/par/efacturaCache");
    const rec = recordingClient(makeInvoices(3));
    await syncUntilDone(rec.client);
    expect((await getSyncProgress(tenantId)).total).toBe(3);

    await resetInvoiceCache(tenantId);
    const progress = await getSyncProgress(tenantId);
    expect(progress.total).toBe(0);
    expect(progress.archiveDone).toBe(false);
    expect(progress.headsSyncedAt).toBeNull();

    const rows = await testDb
      .select()
      .from(parSfsInvoices)
      .where(and(eq(parSfsInvoices.tenantId, tenantId)));
    expect(rows).toHaveLength(0);
  });
});
