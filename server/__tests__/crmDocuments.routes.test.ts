/**
 * @vitest-environment node
 *
 * Oferte și contracte pornite dintr-un lead.
 *
 * Actul e singurul lucru din CRM care pleacă din firmă către client. O greșeală
 * aici nu rămâne internă: ajunge la altcineva, cu antet, cu preț și cu semnătură.
 * De aceea testele urmăresc trei lucruri, în ordinea gravității:
 *
 *  1. un act nu poate fi emis pe datele altui workspace;
 *  2. actul folosește MOTORUL EXISTENT al FinFlow (numerotare, jurnal, șabloane),
 *     nu o a doua implementare care ar diverge tăcut;
 *  3. prețurile și TVA-ul de pe act sunt cele din catalog, nu aproximări.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, leads } from "../db/schema";
import { crmCompanies } from "../db/schema/crmCompanies";
import { crmProducts } from "../db/schema/crmProducts";
import { docDocuments, docDocumentLines } from "../db/schema/docs";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let tenantB: string;
let anaId: string;
let boId: string;
let currentUser: { id: string; tenantId: string; role: string; email: string; name?: string };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", currentUser);
    await next();
  },
}));

import { Hono } from "hono";
let app: Hono;

async function applyMigrations(pg: PGlite) {
  const dir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(dir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

async function post(url: string, body: unknown) {
  const res = await app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmDocumentsRoutes } = await import("../routes/crmDocuments");
  app = new Hono();
  app.route("/api/crm/documents", crmDocumentsRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Alfa", slug: "alfa-docs" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Beta", slug: "beta-docs" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;

  const [ana] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@alfa.md", passwordHash: "x", name: "Ana Pop", role: "admin" })
    .returning();
  const [bo] = await testDb
    .insert(users)
    .values({ tenantId: tenantB, email: "bo@beta.md", passwordHash: "x", name: "Bo Rusu", role: "admin" })
    .returning();
  anaId = ana.id;
  boId = bo.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(docDocumentLines);
  await testDb.delete(docDocuments);
  await testDb.delete(crmProducts);
  await testDb.delete(leads);
  await testDb.delete(crmCompanies);
  currentUser = { id: anaId, tenantId: tenantA, role: "admin", email: "ana@alfa.md", name: "Ana Pop" };
});

async function makeLead(tenantId: string, over: Record<string, unknown> = {}) {
  const [row] = await testDb
    .insert(leads)
    .values({ tenantId, fullName: "Ion Popescu", stage: "new", ...over })
    .returning();
  return row;
}

async function makeProduct(tenantId: string, over: Record<string, unknown> = {}) {
  const [row] = await testDb
    .insert(crmProducts)
    .values({
      tenantId,
      name: "Instalare panouri 10 kW",
      unit: "buc",
      listPriceCents: 15_000_00,
      vatPercent: "20.00",
      currency: "MDL",
      ...over,
    })
    .returning();
  return row;
}

// ─── Izolarea ────────────────────────────────────────────────────────────────

describe("izolarea între workspace-uri", () => {
  it("[blocant] nu se poate emite un act pe un lead din alt workspace", async () => {
    const theirs = await makeLead(tenantB);
    const res = await post("/api/crm/documents", { leadId: theirs.id, kind: "oferta_comerciala" });
    expect(res.status).toBe(404);

    const docs = await testDb.select().from(docDocuments);
    expect(docs).toHaveLength(0);
  });

  it("[blocant] un produs din alt workspace nu ajunge pe act", async () => {
    // Altfel oferta ar pleca la client cu prețul altei firme — sau cu un rând gol.
    const mine = await makeLead(tenantA);
    const theirProduct = await makeProduct(tenantB, { name: "Produs secret Beta" });

    const res = await post("/api/crm/documents", {
      leadId: mine.id,
      items: [{ productId: theirProduct.id, quantity: 1 }],
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("product_not_found");
    expect(await testDb.select().from(docDocuments)).toHaveLength(0);
  });

  it("[blocant] lista de acte a unui workspace nu se vede din altul", async () => {
    const mine = await makeLead(tenantA, { fullName: "Client Secret Alfa" });
    await post("/api/crm/documents", { leadId: mine.id });

    currentUser = { id: boId, tenantId: tenantB, role: "admin", email: "bo@beta.md", name: "Bo Rusu" };
    const res = await app.request("/api/crm/documents");
    expect(JSON.stringify(await res.json())).not.toContain("Client Secret Alfa");
  });
});

// ─── Actul folosește motorul existent ────────────────────────────────────────

describe("actul pornit din lead", () => {
  it("se creează ca ciornă, fără număr — numărul se rezervă abia la finalizare", async () => {
    const lead = await makeLead(tenantA);
    const res = await post("/api/crm/documents", { leadId: lead.id, kind: "oferta_comerciala" });
    expect(res.status).toBe(201);

    const [doc] = await testDb.select().from(docDocuments);
    expect(doc.status).toBe("draft");
    // Regula motorului FinFlow, pe care n-o rescriem: un act nefinalizat n-are
    // număr, ca să nu existe găuri în numerotare dacă ciorna e abandonată.
    expect(doc.docNumber).toBeNull();
  });

  it("actul rămâne legat de lead-ul din care a plecat", async () => {
    const lead = await makeLead(tenantA);
    await post("/api/crm/documents", { leadId: lead.id });

    const [doc] = await testDb.select().from(docDocuments);
    expect(doc.counterpartyKind).toBe("crm_lead");
    expect(doc.counterpartyId).toBe(lead.id);

    const res = await app.request(`/api/crm/documents?leadId=${lead.id}`);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it("titlul implicit spune ce e și cu cine, fără să fie nevoie să-l scrie omul", async () => {
    const lead = await makeLead(tenantA, { fullName: "Ion Popescu", company: "Agro Nord SRL" });
    await post("/api/crm/documents", { leadId: lead.id, kind: "oferta_comerciala" });

    const [doc] = await testDb.select().from(docDocuments);
    expect(doc.title).toContain("Ofertă comercială");
    expect(doc.title).toContain("Agro Nord SRL");
  });
});

// ─── Contrapartea ────────────────────────────────────────────────────────────

describe("cu cine se încheie actul", () => {
  it("[blocant] când lead-ul are firmă, actul se încheie cu FIRMA, nu cu persoana", async () => {
    const [company] = await testDb
      .insert(crmCompanies)
      .values({
        tenantId: tenantA,
        name: "Agro Nord SRL",
        nameNormalized: "agro nord srl",
        idno: "1003600012345",
        address: "mun. Bălți, str. Ștefan cel Mare 1",
      })
      .returning();
    const lead = await makeLead(tenantA, { fullName: "Ion Popescu", companyId: company.id });

    await post("/api/crm/documents", { leadId: lead.id });
    const [doc] = await testDb.select().from(docDocuments);

    expect(doc.counterpartyName).toBe("Agro Nord SRL");
    const snap = JSON.parse(doc.counterpartySnapshot ?? "{}") as Record<string, string>;
    expect(snap.idno).toBe("1003600012345");
    expect(snap.adresa).toContain("Bălți");
    // Persoana rămâne ca reprezentant — nu dispare, dar nu ea semnează ca parte.
    expect(snap.administrator).toBe("Ion Popescu");
  });

  it("fără firmă, contrapartea e persoana, iar rechizitele lipsă rămân GOALE", async () => {
    // Nu inventăm un IDNO ca să arate actul complet — un câmp necompletat e
    // adevărul, și motorul îl semnalează ca atare.
    const lead = await makeLead(tenantA, { fullName: "Ion Popescu", phone: "069391979" });
    await post("/api/crm/documents", { leadId: lead.id });

    const [doc] = await testDb.select().from(docDocuments);
    const snap = JSON.parse(doc.counterpartySnapshot ?? "{}") as Record<string, string>;
    expect(doc.counterpartyName).toBe("Ion Popescu");
    expect(snap.idno).toBeUndefined();
    expect(snap.telefon).toBe("069391979");
  });
});

// ─── Rândurile și banii ──────────────────────────────────────────────────────

describe("prețurile de pe act", () => {
  it("rândurile vin din catalog: denumire, unitate, preț și TVA", async () => {
    const lead = await makeLead(tenantA);
    const product = await makeProduct(tenantA);

    await post("/api/crm/documents", { leadId: lead.id, items: [{ productId: product.id, quantity: 2 }] });

    const [line] = await testDb.select().from(docDocumentLines);
    expect(line.description).toBe("Instalare panouri 10 kW");
    expect(line.quantity).toBe(2);
    expect(line.unitPriceCents).toBe(15_000_00);
    expect(line.vatPercent).toBe(20);
  });

  it("un preț negociat îl învinge pe cel din catalog", async () => {
    const lead = await makeLead(tenantA);
    const product = await makeProduct(tenantA);

    await post("/api/crm/documents", {
      leadId: lead.id,
      items: [{ productId: product.id, quantity: 1, unitPriceCents: 12_500_00 }],
    });

    const [line] = await testDb.select().from(docDocumentLines);
    expect(line.unitPriceCents).toBe(12_500_00);
  });

  it("totalul actului e suma rândurilor, calculată de motor", async () => {
    const lead = await makeLead(tenantA);
    const product = await makeProduct(tenantA, { listPriceCents: 1_000_00, vatPercent: "0.00" });

    await post("/api/crm/documents", { leadId: lead.id, items: [{ productId: product.id, quantity: 3 }] });

    const [doc] = await testDb.select().from(docDocuments);
    expect(doc.totalCents).toBe(3_000_00);
  });

  it("[blocant] produsele în monede diferite nu ajung pe același act", async () => {
    // Un act are UN total. Un rând în MDL și unul în EUR ar da o sumă fără sens,
    // pe care clientul ar primi-o ca pe un preț real.
    const lead = await makeLead(tenantA);
    const mdl = await makeProduct(tenantA, { name: "Panouri", currency: "MDL" });
    const eur = await makeProduct(tenantA, { name: "Invertor", currency: "EUR" });

    const res = await post("/api/crm/documents", {
      leadId: lead.id,
      items: [
        { productId: mdl.id, quantity: 1 },
        { productId: eur.id, quantity: 1 },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("currency_mismatch");
    expect(await testDb.select().from(docDocuments)).toHaveLength(0);
  });

  it("moneda actului o urmează pe cea a produselor, fără s-o ceară omul", async () => {
    const lead = await makeLead(tenantA);
    const product = await makeProduct(tenantA, { currency: "EUR" });

    await post("/api/crm/documents", { leadId: lead.id, items: [{ productId: product.id, quantity: 1 }] });
    const [doc] = await testDb.select().from(docDocuments);
    expect(doc.currency).toBe("EUR");
  });

  it("se pot adăuga rânduri scrise de mână, pentru ce nu e în catalog", async () => {
    const lead = await makeLead(tenantA);
    await post("/api/crm/documents", {
      leadId: lead.id,
      extraLines: [{ description: "Transport și montaj", unit: "serviciu", quantity: 1, unitPriceCents: 500_00 }],
    });

    const [line] = await testDb.select().from(docDocumentLines);
    expect(line.description).toBe("Transport și montaj");
    expect(line.unitPriceCents).toBe(500_00);
  });
});

// ─── Lanțul ofertă → contract ────────────────────────────────────────────────

describe("de la ofertă la contract", () => {
  it("contractul poate spune în baza cărei oferte s-a încheiat", async () => {
    const lead = await makeLead(tenantA);
    const res = await post("/api/crm/documents", {
      leadId: lead.id,
      kind: "contract_servicii",
      basedOn: "ofertei nr. 12 din 14.09.2026",
    });
    expect(res.status).toBe(201);

    const [doc] = await testDb.select().from(docDocuments).where(eq(docDocuments.tenantId, tenantA));
    const ctx = JSON.parse(doc.context) as Record<string, string>;
    expect(ctx["document.baza"]).toContain("ofertei nr. 12");
  });
});
