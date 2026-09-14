/**
 * @vitest-environment node
 * PRODUSUL ȘI PROBABILITATEA PE OPORTUNITATE — INTEGRATION (cerința 10 din caietul de sarcini).
 *
 * Până acum „produsul" unui lead era textul liber din `interest_course`, iar raportul „pe produs"
 * grupa după ce tastase fiecare om: „Panouri 10kW", „panouri 10 kw" și „PV 10" apăreau ca trei
 * produse diferite. Testele de aici închid exact asta — plus probabilitatea proprie a
 * oportunității, pe care caietul o cere per afacere, nu doar per etapă.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads, leadInteractions } from "../db/schema/leads";
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
let tenantId: string;
let userId: string;
let produsA: string;
let produsB: string;

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

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmLeadsRoutes } = await import("../routes/crmLeads");
  const { crmReportsRoutes } = await import("../routes/crmReports");
  app = new Hono();
  app.route("/api/crm/leads", crmLeadsRoutes);
  app.route("/api/crm/reports", crmReportsRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-prod" }).returning();
  tenantId = t.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "ana@eco.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  userId = u.id;

  await testDb.insert(crmPipelineStages).values([
    { tenantId, key: "new", label: "Lead nou", orderIndex: 0, probabilityPct: 10 },
    { tenantId, key: "castigat", label: "Câștigat", orderIndex: 1, isWon: true, probabilityPct: 100 },
  ]);

  const [pA] = await testDb
    .insert(crmProducts)
    .values({ tenantId, name: "Panouri 10 kW", listPriceCents: 500_00 })
    .returning();
  const [pB] = await testDb
    .insert(crmProducts)
    .values({ tenantId, name: "Pompă de căldură", listPriceCents: 900_00 })
    .returning();
  produsA = pA.id;
  produsB = pB.id;

  session = { id: userId, tenantId, role: "admin", email: "ana@eco.md" };
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Produsul oportunității vine din catalog", () => {
  it("[blocant] leadul se creează cu produs și probabilitate proprie", async () => {
    const res = await app.request("/api/crm/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: "Primăria Ialoveni",
        productId: produsA,
        probabilityPct: 65,
        valueCents: 750_00,
      }),
    });

    expect(res.status).toBe(201);
    const [row] = await testDb.select().from(leads).where(eq(leads.fullName, "Primăria Ialoveni"));
    expect(row.productId).toBe(produsA);
    expect(row.probabilityPct).toBe(65);
  });

  it("[blocant] raportul „pe produs” grupează după CATALOG, nu după textul tastat", async () => {
    // Trei leaduri, două cu același produs din catalog dar text liber scris diferit.
    const mk = async (interestCourse: string, productId: string | null, stage: string) => {
      const [l] = await testDb
        .insert(leads)
        .values({ tenantId, fullName: `Client ${interestCourse}`, stage, productId, interestCourse, valueCents: 100_00 })
        .returning();
      if (stage === "castigat") {
        await testDb.insert(leadInteractions).values({
          tenantId,
          leadId: l.id,
          type: "stage_change",
          direction: "internal",
          body: "new → castigat",
          metadata: { from: "new", to: "castigat" },
        });
      }
      return l.id;
    };
    await mk("Panouri 10kW", produsA, "castigat");
    await mk("panouri 10 kw", produsA, "new");
    await mk("Pompa", produsB, "new");

    const body = await (await app.request("/api/crm/reports")).json();
    const produse = (body.perProduct as Array<{ product: string; total: number }>);

    // Numele din catalog, o singură dată — nu trei variante ortografice.
    const panouri = produse.find((p) => p.product === "Panouri 10 kW");
    expect(panouri).toBeDefined();
    expect(panouri!.total).toBeGreaterThanOrEqual(2);
    expect(produse.some((p) => p.product === "panouri 10 kw")).toBe(false);
    expect(produse.some((p) => p.product === "Pompă de căldură")).toBe(true);
  });

  it("[normal] leadul fără produs ales rămâne pe textul lui — nu i se ghicește unul", async () => {
    await testDb.insert(leads).values({
      tenantId,
      fullName: "Fără produs ales",
      stage: "new",
      interestCourse: "Ceva nedefinit",
      valueCents: 0,
    });

    const body = await (await app.request("/api/crm/reports")).json();
    const produse = (body.perProduct as Array<{ product: string }>).map((p) => p.product);
    expect(produse).toContain("Ceva nedefinit");
  });

  it("[normal] probabilitatea goală înseamnă „moștenește de la etapă”, nu 0%", async () => {
    const [lead] = await testDb.select().from(leads).where(eq(leads.fullName, "Fără produs ales"));
    expect(lead.probabilityPct).toBeNull();

    const res = await app.request(`/api/crm/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ probabilityPct: null }),
    });
    expect(res.status).toBe(200);

    const [after] = await testDb.select().from(leads).where(eq(leads.id, lead.id));
    expect(after.probabilityPct).toBeNull();
  });
});
