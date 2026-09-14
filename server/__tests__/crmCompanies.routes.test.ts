/**
 * @vitest-environment node
 *
 * Firme + unificarea duplicatelor, pe rutele reale.
 *
 * Testul cel mai important din fișier e primul: o unificare între workspace-uri
 * ar amesteca datele a doi clienți diferiți și e IREVERSIBILĂ. Aici nu există
 * RLS care să prindă o scăpare — doar filtrul scris de mână în fiecare query.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, leads, leadInteractions, leadTags } from "../db/schema";
import { crmLeadTasks } from "../db/schema/crmTasks";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let tenantB: string;
let userA: string;
let userB: string;
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

  const [tA] = await testDb.insert(tenants).values({ name: "Alfa", slug: "alfa-firme" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Beta", slug: "beta-firme" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;
  const [uA] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@alfa.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  const [uB] = await testDb
    .insert(users)
    .values({ tenantId: tenantB, email: "bo@beta.md", passwordHash: "x", name: "Bo", role: "admin" })
    .returning();
  userA = uA.id;
  userB = uB.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(leadTags);
  await testDb.delete(crmLeadTasks);
  await testDb.delete(leadInteractions);
  await testDb.delete(leads);
  currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "ana@alfa.md" };
});

async function makeLead(tenantId: string, fullName: string, extra: Record<string, unknown> = {}) {
  const [row] = await testDb
    .insert(leads)
    .values({ tenantId, fullName, stage: "new", ...extra })
    .returning();
  return row;
}

describe("POST /api/crm/companies/merge", () => {
  it("[blocant] o fișă dintr-un workspace nu poate fi unificată cu una din altul", async () => {
    const mine = await makeLead(tenantA, "Ion Popescu", { phone: "069391979", phoneNormalized: "69391979" });
    const theirs = await makeLead(tenantB, "Ion Popescu", { phone: "069391979", phoneNormalized: "69391979" });

    const res = await app.request("/api/crm/companies/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ primaryId: mine.id, duplicateIds: [theirs.id] }),
    });
    expect(res.status).toBe(404);

    // Și, mai important: fișa celuilalt workspace a rămas NEATINSĂ.
    const [untouched] = await testDb.select().from(leads).where(eq(leads.id, theirs.id));
    expect(untouched.mergedIntoId).toBeNull();
  });

  it("[blocant] după unificare, istoricul ambelor fișe se vede pe fișa păstrată", async () => {
    const keep = await makeLead(tenantA, "Ion Popescu", { phone: "069391979", phoneNormalized: "69391979" });
    const dup = await makeLead(tenantA, "Ion Popescu", { email: "ion@x.md", emailNormalized: "ion@x.md" });

    await testDb.insert(leadInteractions).values([
      { tenantId: tenantA, leadId: keep.id, type: "note", direction: "internal", body: "prima discuție" },
      { tenantId: tenantA, leadId: dup.id, type: "note", direction: "internal", body: "a sunat din nou" },
    ]);
    await testDb.insert(crmLeadTasks).values({ tenantId: tenantA, leadId: dup.id, title: "De sunat luni" });

    const res = await app.request("/api/crm/companies/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ primaryId: keep.id, duplicateIds: [dup.id] }),
    });
    expect(res.status).toBe(200);

    const kept = await testDb.select().from(leadInteractions).where(eq(leadInteractions.leadId, keep.id));
    const bodies = kept.map((i) => i.body ?? "");
    expect(bodies.some((b) => b.includes("prima discuție"))).toBe(true);
    expect(bodies.some((b) => b.includes("a sunat din nou"))).toBe(true);
    // Și taskul deschis a venit cu el — altfel munca programată s-ar pierde.
    const tasks = await testDb.select().from(crmLeadTasks).where(eq(crmLeadTasks.leadId, keep.id));
    expect(tasks).toHaveLength(1);
  });

  it("[blocant] fișa duplicat se marchează, NU se șterge", async () => {
    const keep = await makeLead(tenantA, "Ana Pop", { email: "ana@x.md", emailNormalized: "ana@x.md" });
    const dup = await makeLead(tenantA, "Ana Pop", { email: "ana@x.md", emailNormalized: "ana@x.md" });

    await app.request("/api/crm/companies/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ primaryId: keep.id, duplicateIds: [dup.id] }),
    });

    const [still] = await testDb.select().from(leads).where(eq(leads.id, dup.id));
    expect(still).toBeDefined();
    expect(still.mergedIntoId).toBe(keep.id);
  });

  it("unificarea lasă urmă în istoric: ce fișe au fost unite", async () => {
    const keep = await makeLead(tenantA, "Ana Pop", { email: "ana@x.md", emailNormalized: "ana@x.md" });
    const dup = await makeLead(tenantA, "Ana Popescu", { email: "ana@x.md", emailNormalized: "ana@x.md" });

    await app.request("/api/crm/companies/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ primaryId: keep.id, duplicateIds: [dup.id] }),
    });

    const rows = await testDb.select().from(leadInteractions).where(eq(leadInteractions.leadId, keep.id));
    const sys = rows.find((r) => r.type === "system");
    expect(sys?.body).toContain("Unificare");
    expect(sys?.body).toContain("Ana Popescu");
  });

  it("etichetele care s-ar ciocni nu se dublează pe fișa păstrată", async () => {
    const keep = await makeLead(tenantA, "Ana", { email: "a@x.md", emailNormalized: "a@x.md" });
    const dup = await makeLead(tenantA, "Ana", { email: "a@x.md", emailNormalized: "a@x.md" });
    await testDb.insert(leadTags).values([
      { tenantId: tenantA, leadId: keep.id, tag: "vip" },
      { tenantId: tenantA, leadId: dup.id, tag: "vip" },
      { tenantId: tenantA, leadId: dup.id, tag: "recomandare" },
    ]);

    await app.request("/api/crm/companies/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ primaryId: keep.id, duplicateIds: [dup.id] }),
    });

    const tags = await testDb.select().from(leadTags).where(eq(leadTags.leadId, keep.id));
    const values = tags.map((t) => t.tag).sort();
    expect(values).toEqual(["recomandare", "vip"]);
  });

  it("o fișă nu poate fi unificată cu ea însăși", async () => {
    const l = await makeLead(tenantA, "Ion");
    const res = await app.request("/api/crm/companies/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ primaryId: l.id, duplicateIds: [l.id] }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/crm/companies/duplicates", () => {
  it("[blocant] nu raportează ca duplicat fișe din alt workspace", async () => {
    await makeLead(tenantA, "Ion Popescu", { phone: "069391979", phoneNormalized: "69391979" });
    await makeLead(tenantB, "Ion Popescu", { phone: "069391979", phoneNormalized: "69391979" });

    const res = await app.request("/api/crm/companies/duplicates");
    const body = await res.json();
    // Un singur lead în workspace-ul A → nu are cu cine forma un cluster.
    expect(body.clusters).toHaveLength(0);
  });

  it("fișele deja unificate nu mai reapar în detecție", async () => {
    const keep = await makeLead(tenantA, "Ana", { email: "a@x.md", emailNormalized: "a@x.md" });
    const dup = await makeLead(tenantA, "Ana", { email: "a@x.md", emailNormalized: "a@x.md" });
    await app.request("/api/crm/companies/merge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ primaryId: keep.id, duplicateIds: [dup.id] }),
    });

    const res = await app.request("/api/crm/companies/duplicates");
    const body = await res.json();
    expect(body.clusters).toHaveLength(0);
  });
});

describe("Firme", () => {
  it("[blocant] firmele unui workspace nu sunt vizibile din altul", async () => {
    await app.request("/api/crm/companies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "SRL Alfa Secret" }),
    });

    currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bo@beta.md" };
    const res = await app.request("/api/crm/companies");
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("Alfa Secret");
  });

  it("căutarea găsește firma după nume și după cod fiscal", async () => {
    await app.request("/api/crm/companies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Agro Nord SRL", idno: "1003600012345" }),
    });

    const byName = await (await app.request("/api/crm/companies?search=agro")).json();
    expect(byName.items).toHaveLength(1);
    const byIdno = await (await app.request("/api/crm/companies?search=1003600")).json();
    expect(byIdno.items).toHaveLength(1);
  });
});
