/**
 * @vitest-environment node
 * SEGMENTAREA BAZEI DE LEADURI — INTEGRATION (cerința 4 din caietul de sarcini).
 *
 * Caietul cere segmentare „după industrie, regiune, mărime, consum, produs, sursă". Firmografia
 * trăiește pe `crm_companies`; până acum nu se putea filtra din tabla de leaduri, deci matricea
 * de conformitate spunea „Parțial". Testele de aici apără exact ce s-a adăugat:
 *
 *  1. filtrul firmografic cerne leadurile prin FIRMA lor, în listă ȘI pe tablă;
 *  2. pragurile de consum se compară NUMERIC (900 nu e mai mare decât 1000, cum ar fi fost dacă
 *     s-ar fi comparat textul coloanei `numeric`);
 *  3. leadul fără firmă nu intră în niciun segment firmografic;
 *  4. **un rând al unui workspace nu e vizibil din altul** — testul care se scrie primul la
 *     fiecare fază portată (regula din PORT-DIN-CRM-VECTOR.md).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads } from "../db/schema/leads";
import { crmCompanies } from "../db/schema/crmCompanies";
import { crmProducts } from "../db/schema/crmProducts";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", session);
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;
let tenantA: string;
let tenantB: string;
let userA: { id: string; tenantId: string; role: string; email: string };
let userB: { id: string; tenantId: string; role: string; email: string };
let produsPanouri: string;

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

/** Numele leadurilor dintr-un răspuns de listă, ca așteptările să se citească ca o propoziție. */
function namesOf(body: { items: { fullName: string }[] }): string[] {
  return body.items.map((i) => i.fullName).sort();
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmLeadsRoutes } = await import("../routes/crmLeads");
  app = new Hono();
  app.route("/api/crm/leads", crmLeadsRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-seg" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Concurentul", slug: "rival-seg" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;

  const [uA] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@eco.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  const [uB] = await testDb
    .insert(users)
    .values({ tenantId: tenantB, email: "bob@rival.md", passwordHash: "x", name: "Bob", role: "admin" })
    .returning();
  userA = { id: uA.id, tenantId: tenantA, role: "admin", email: uA.email };
  userB = { id: uB.id, tenantId: tenantB, role: "admin", email: uB.email };
  session = userA;

  await testDb.insert(crmPipelineStages).values([
    { tenantId: tenantA, key: "new", label: "Lead nou", orderIndex: 0 },
    { tenantId: tenantA, key: "castigat", label: "Câștigat", orderIndex: 1, isWon: true },
  ]);

  const [prod] = await testDb
    .insert(crmProducts)
    .values({ tenantId: tenantA, name: "Panouri 10 kW", listPriceCents: 500_00 })
    .returning();
  produsPanouri = prod.id;

  // Trei firme ale tenantului A, cu firmografie diferită.
  const [fabrica] = await testDb
    .insert(crmCompanies)
    .values({
      tenantId: tenantA,
      name: "Fabrica de Zahăr",
      industry: "Industrie alimentară",
      region: "Nord",
      companySize: "51-250",
      annualConsumptionKwh: "900000",
    })
    .returning();
  const [pensiunea] = await testDb
    .insert(crmCompanies)
    .values({
      tenantId: tenantA,
      name: "Pensiunea Codru",
      industry: "HoReCa",
      region: "Centru",
      companySize: "1-10",
      annualConsumptionKwh: "9000",
    })
    .returning();
  const [depozitul] = await testDb
    .insert(crmCompanies)
    .values({
      tenantId: tenantA,
      name: "Depozitul Frigorific",
      industry: "Industrie alimentară",
      region: "Centru",
      companySize: "11-50",
      annualConsumptionKwh: "120000",
    })
    .returning();

  // Firma tenantului B are ACEEAȘI industrie — dacă filtrul ar scăpa tenantul, s-ar vedea aici.
  const [rival] = await testDb
    .insert(crmCompanies)
    .values({
      tenantId: tenantB,
      name: "Fabrica Rivală",
      industry: "Industrie alimentară",
      region: "Nord",
      companySize: "51-250",
      annualConsumptionKwh: "900000",
    })
    .returning();

  await testDb.insert(leads).values([
    { tenantId: tenantA, fullName: "Lead Fabrica", stage: "new", companyId: fabrica.id, productId: produsPanouri },
    { tenantId: tenantA, fullName: "Lead Pensiune", stage: "new", companyId: pensiunea.id },
    { tenantId: tenantA, fullName: "Lead Depozit", stage: "new", companyId: depozitul.id, productId: produsPanouri },
    // Fără firmă atașată: nu are cum să aibă industrie.
    { tenantId: tenantA, fullName: "Lead Fără Firmă", stage: "new" },
    { tenantId: tenantB, fullName: "Lead Rival", stage: "new", companyId: rival.id },
  ]);
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Segmentarea leadurilor după firmografie (cerința 4)", () => {
  it("[blocant] filtrul pe industrie cerne prin FIRMA leadului", async () => {
    const res = await app.request("/api/crm/leads?industry=Industrie%20alimentar%C4%83");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(namesOf(body)).toEqual(["Lead Depozit", "Lead Fabrica"]);
    expect(body.total).toBe(2);
  });

  it("[blocant] leadul FĂRĂ firmă nu intră în niciun segment firmografic", async () => {
    const body = await (await app.request("/api/crm/leads?region=Centru")).json();
    expect(namesOf(body)).toEqual(["Lead Depozit", "Lead Pensiune"]);
    expect(namesOf(body)).not.toContain("Lead Fără Firmă");
  });

  it("[blocant] pragurile de consum se compară numeric, nu ca text", async () => {
    // Textual, „9000" > „120000" (caracterul „9" bate „1"). Dacă s-ar compara ca text,
    // pensiunea cu 9 MWh ar apărea peste pragul de 100 MWh.
    const body = await (await app.request("/api/crm/leads?minConsumptionKwh=100000")).json();
    expect(namesOf(body)).toEqual(["Lead Depozit", "Lead Fabrica"]);

    const interval = await (
      await app.request("/api/crm/leads?minConsumptionKwh=10000&maxConsumptionKwh=500000")
    ).json();
    expect(namesOf(interval)).toEqual(["Lead Depozit"]);
  });

  it("[blocant] filtrele se combină (ȘI, nu SAU)", async () => {
    const body = await (
      await app.request("/api/crm/leads?industry=Industrie%20alimentar%C4%83&region=Nord")
    ).json();
    expect(namesOf(body)).toEqual(["Lead Fabrica"]);
  });

  it("[blocant] un lead al altui workspace nu apare în segmentul meu", async () => {
    // Tenantul B are o firmă cu exact aceeași industrie, regiune, mărime și consum.
    const aleA = await (await app.request("/api/crm/leads?industry=Industrie%20alimentar%C4%83")).json();
    expect(namesOf(aleA)).not.toContain("Lead Rival");

    session = userB;
    const aleB = await (await app.request("/api/crm/leads?industry=Industrie%20alimentar%C4%83")).json();
    expect(namesOf(aleB)).toEqual(["Lead Rival"]);
    session = userA;
  });

  it("[normal] filtrul pe produs cerne pe catalogul leadului", async () => {
    const body = await (await app.request(`/api/crm/leads?productId=${produsPanouri}`)).json();
    expect(namesOf(body)).toEqual(["Lead Depozit", "Lead Fabrica"]);
  });

  it("[normal] o valoare fără sens în filtru nu dă 400 — doar nu filtrează", async () => {
    const body = await (await app.request("/api/crm/leads?minConsumptionKwh=abc&productId=nu-e-uuid")).json();
    expect(body.total).toBe(4); // toate leadurile tenantului A
  });
});

describe("Segmentarea pe TABLĂ (aceleași filtre, același rezultat)", () => {
  it("[blocant] kanbanul cerne cu aceleași filtre ca lista", async () => {
    const res = await app.request("/api/crm/leads/pipeline?industry=Industrie%20alimentar%C4%83");
    expect(res.status).toBe(200);
    const body = await res.json();
    const carduri = (body.grouped.new as { fullName: string }[]).map((l) => l.fullName).sort();
    expect(carduri).toEqual(["Lead Depozit", "Lead Fabrica"]);
    // Numărătoarea coloanei descrie SEGMENTUL, nu pâlnia întreagă — altfel „2 carduri din 4"
    // ar arăta ca o pierdere de date.
    expect(body.counts.new).toBe(2);
    expect(body.segmented).toBe(true);
  });

  it("[normal] fără filtre, tabla rămâne exact cum era", async () => {
    const body = await (await app.request("/api/crm/leads/pipeline")).json();
    expect(body.counts.new).toBe(4);
    expect(body.segmented).toBe(false);
  });
});

describe("Opțiunile de segmentare (GET /segments)", () => {
  it("[blocant] întoarce doar valorile CARE EXISTĂ în workspace-ul meu", async () => {
    const body = await (await app.request("/api/crm/leads/segments")).json();
    expect(body.industries).toEqual(["HoReCa", "Industrie alimentară"]);
    expect(body.regions).toEqual(["Centru", "Nord"]);
    expect(body.sizes).toEqual(["1-10", "11-50", "51-250"]);
    expect(body.products.map((p: { name: string }) => p.name)).toEqual(["Panouri 10 kW"]);
    expect(body.consumption).toEqual({ min: 9000, max: 900000 });
  });

  it("[blocant] ruta „segments” nu e citită ca un id de lead", async () => {
    // Ruta stă ÎNAINTE de `/:id`; dacă ordinea se inversează vreodată, răspunsul ar fi 404.
    const res = await app.request("/api/crm/leads/segments");
    expect(res.status).toBe(200);
  });

  it("[normal] alt workspace vede propriile valori, nu pe ale mele", async () => {
    session = userB;
    const body = await (await app.request("/api/crm/leads/segments")).json();
    expect(body.industries).toEqual(["Industrie alimentară"]);
    expect(body.products).toEqual([]);
    session = userA;
  });
});
