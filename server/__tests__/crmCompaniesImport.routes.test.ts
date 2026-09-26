/**
 * @vitest-environment node
 *
 * Importul de firme și fișa clientului, pe rutele reale (PGlite + migrările din repo).
 *
 * Ce apără: (1) previzualizarea și importul dau același verdict; (2) un import nu atinge firmele
 * altui workspace și nu redenumește fișe existente; (3) fișa clientului adună lead-urile,
 * contactele și istoricul DOAR din workspace-ul curent.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, leads, leadInteractions, leadContacts } from "../db/schema";
import { crmCompanies } from "../db/schema/crmCompanies";
import { crmLeadTasks } from "../db/schema/crmTasks";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let tenantB: string;
let userA: string;
let currentUser: { id: string; tenantId: string; role: string; email: string };

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

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmCompaniesRoutes } = await import("../routes/crmCompanies");
  app = new Hono();
  app.route("/api/crm/companies", crmCompaniesRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Alfa", slug: "alfa-import-firme" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Beta", slug: "beta-import-firme" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;
  const [uA] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@alfa-imp.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  userA = uA.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(crmLeadTasks);
  await testDb.delete(leadContacts);
  await testDb.delete(leadInteractions);
  await testDb.delete(leads);
  await testDb.delete(crmCompanies);
  currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "ana@alfa-imp.md" };
});

function post(url: string, body: unknown) {
  return app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const CSV = [
  "Lista clienti export 26.09.2026;;;",
  "Denumirea;Cod fiscal;Telefon;Persoana de contact",
  "Alfa Agro SRL;MD 1003600012345;069111222;Ion Rusu",
  "Beta Grup SA;1003600099999;;",
  ";;;",
  "Gama SRL;;022123456;Ana",
].join("\n");

describe("POST /api/crm/companies/import/*", () => {
  it("[blocant] previzualizarea arată ce se va scrie, iar importul scrie exact atât", async () => {
    const prev = await post("/api/crm/companies/import/preview", { text: CSV, headerRow: 2 });
    expect(prev.status).toBe(200);
    const p = (await prev.json()) as {
      headers: string[];
      mapping: Record<string, string>;
      counts: { total: number; new: number };
      topRows: string[][];
    };
    expect(p.headers[0]).toBe("Denumirea");
    expect(p.mapping).toMatchObject({ 0: "name", 1: "idno", 2: "phone", 3: "notes" });
    expect(p.counts).toMatchObject({ total: 3, new: 3 });
    expect(p.topRows[0][0]).toContain("Lista clienti");

    const run = await post("/api/crm/companies/import/run", { text: CSV, headerRow: 2, mapping: p.mapping });
    expect(run.status).toBe(200);
    const r = (await run.json()) as { created: number };
    expect(r.created).toBe(3);

    const rows = await testDb.select().from(crmCompanies).where(eq(crmCompanies.tenantId, tenantA));
    const alfa = rows.find((x) => x.name === "Alfa Agro SRL");
    expect(alfa?.idno).toBe("1003600012345");
    expect(alfa?.phoneNormalized).toBeTruthy();
    expect(alfa?.notes).toBe("Ion Rusu");
  });

  it("[blocant] reimportul nu dublează firmele, iar „completează” nu redenumește fișa", async () => {
    await testDb.insert(crmCompanies).values({
      tenantId: tenantA,
      name: "Alfa Agro (numele meu)",
      nameNormalized: "alfa agro (numele meu)",
      idno: "1003600012345",
      industry: "Agricultură",
    });
    const run = await post("/api/crm/companies/import/run", { text: CSV, headerRow: 2, existingMode: "fill" });
    const r = (await run.json()) as { created: number; updated: number };
    expect(r.created).toBe(2);
    expect(r.updated).toBe(1);

    const [alfa] = await testDb.select().from(crmCompanies).where(eq(crmCompanies.idno, "1003600012345"));
    expect(alfa.name).toBe("Alfa Agro (numele meu)");
    expect(alfa.industry).toBe("Agricultură");
    expect(alfa.phone).toBe("069111222");

    const again = await post("/api/crm/companies/import/run", { text: CSV, headerRow: 2, existingMode: "fill" });
    expect(((await again.json()) as { created: number }).created).toBe(0);
    const all = await testDb.select().from(crmCompanies).where(eq(crmCompanies.tenantId, tenantA));
    expect(all).toHaveLength(3);
  });

  it("[blocant] o firmă cu același cod din ALT workspace nu e „existentă” și nu se atinge", async () => {
    const [theirs] = await testDb
      .insert(crmCompanies)
      .values({ tenantId: tenantB, name: "Alfa Beta", nameNormalized: "alfa beta", idno: "1003600012345" })
      .returning();
    const run = await post("/api/crm/companies/import/run", { text: CSV, headerRow: 2, existingMode: "overwrite" });
    expect(((await run.json()) as { created: number }).created).toBe(3);
    const [still] = await testDb.select().from(crmCompanies).where(eq(crmCompanies.id, theirs.id));
    expect(still.phone).toBeNull();
    expect(still.name).toBe("Alfa Beta");
  });

  it("un cont fără acces la CRM (părinte) nu poate importa", async () => {
    currentUser = { ...currentUser, role: "parent" };
    const res = await post("/api/crm/companies/import/run", { text: CSV, headerRow: 2 });
    expect(res.status).toBe(403);
  });

  it("o țintă de mapare inventată e refuzată", async () => {
    const res = await post("/api/crm/companies/import/preview", { text: CSV, mapping: { 0: "parola" } });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/crm/companies/:id/overview", () => {
  it("[blocant] fișa adună lead-urile, contactele și istoricul firmei", async () => {
    const [co] = await testDb
      .insert(crmCompanies)
      .values({ tenantId: tenantA, name: "Alfa Agro SRL", nameNormalized: "alfa agro srl" })
      .returning();
    const [lead] = await testDb
      .insert(leads)
      .values({ tenantId: tenantA, fullName: "Ion Rusu", phone: "069111222", stage: "new", companyId: co.id, valueCents: 150000 })
      .returning();
    await testDb.insert(leadContacts).values({ tenantId: tenantA, leadId: lead.id, fullName: "Maria Contabil", role: "Contabil" });
    await testDb.insert(leadInteractions).values({ tenantId: tenantA, leadId: lead.id, type: "call", direction: "outbound", body: "a cerut oferta", userId: userA });
    await testDb.insert(crmLeadTasks).values({ tenantId: tenantA, leadId: lead.id, title: "Trimite oferta" });

    const res = await app.request(`/api/crm/companies/${co.id}/overview`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      company: { name: string };
      stats: { deals: number; openValueCents: number };
      deals: { id: string }[];
      contacts: { fullName: string }[];
      tasks: { title: string }[];
      activity: { body: string; userName: string; leadName: string }[];
    };
    expect(body.company.name).toBe("Alfa Agro SRL");
    expect(body.stats.deals).toBe(1);
    expect(body.stats.openValueCents).toBe(150000);
    expect(body.contacts.map((c) => c.fullName).sort()).toEqual(["Ion Rusu", "Maria Contabil"]);
    expect(body.tasks[0].title).toBe("Trimite oferta");
    expect(body.activity[0]).toMatchObject({ body: "a cerut oferta", userName: "Ana", leadName: "Ion Rusu" });
  });

  it("[blocant] fișa unei firme din alt workspace dă 404", async () => {
    const [theirs] = await testDb
      .insert(crmCompanies)
      .values({ tenantId: tenantB, name: "Străină SRL", nameNormalized: "straina srl" })
      .returning();
    const res = await app.request(`/api/crm/companies/${theirs.id}/overview`);
    expect(res.status).toBe(404);
  });

  it("lista arată câte oportunități are fiecare firmă", async () => {
    const [co] = await testDb
      .insert(crmCompanies)
      .values({ tenantId: tenantA, name: "Alfa", nameNormalized: "alfa" })
      .returning();
    await testDb.insert(leads).values({ tenantId: tenantA, fullName: "X", stage: "new", companyId: co.id });
    const res = await app.request("/api/crm/companies");
    const body = (await res.json()) as { items: { id: string; leadCount: number }[] };
    expect(body.items.find((i) => i.id === co.id)?.leadCount).toBe(1);
  });
});
