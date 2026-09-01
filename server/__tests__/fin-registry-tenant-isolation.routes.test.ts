/**
 * @vitest-environment node
 *
 * SEC — registrul fiscal nu răspunde despre altă organizație.
 *
 * Ruta accepta `?tenantId=` ca filtru, iar citirea după id nu avea NICIUN filtru de organizație:
 * cine afla (sau ghicea) un id primea cotele altcuiva, iar `POST` putea SCRIE o cotă în registrul
 * altei organizații. Testul rulează exact aceste trei apeluri, ca fixul să nu poată fi anulat tăcut.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { finTaxRates, finChartOfAccounts } from "../db/schema/finRegistry";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let myTenant: string;
let otherTenant: string;
let myUser: string;
let otherRateId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: myUser, tenantId: myTenant, role: "admin", email: "ana@a.md", name: "Ana" });
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

beforeAll(async () => {
  pglite = new PGlite();
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pglite.exec(stmt);
    }
  }
  testDb = drizzle(pglite, { schema });

  const { finRegistryRoutes } = await import("../routes/finRegistry");
  app = new Hono();
  app.route("/api/fin/registry", finRegistryRoutes);

  const [a] = await testDb.insert(tenants).values({ name: "A", slug: "sec-a" }).returning();
  const [b] = await testDb.insert(tenants).values({ name: "B", slug: "sec-b" }).returning();
  myTenant = a.id;
  otherTenant = b.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId: myTenant, email: "ana@a.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  myUser = u.id;

  await testDb.insert(finTaxRates).values({
    tenantId: myTenant,
    country: "MD",
    kind: "vat",
    name: "TVA A",
    ratePct: "20.0000",
    effectiveFrom: "2026-01-01",
  });
  const [otherRate] = await testDb
    .insert(finTaxRates)
    .values({
      tenantId: otherTenant,
      country: "MD",
      kind: "vat",
      name: "TVA B — secretul altcuiva",
      ratePct: "8.0000",
      effectiveFrom: "2026-01-01",
    })
    .returning();
  otherRateId = otherRate.id;

  await testDb.insert(finChartOfAccounts).values({
    tenantId: otherTenant,
    country: "MD",
    accountCode: "999",
    accountName: "Cont al altei organizații",
    accountType: "asset",
  });
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

describe("SEC — izolarea registrului fiscal între organizații", () => {
  it("[blocant] `?tenantId=` al altei organizații NU deschide cotele ei", async () => {
    const res = await app.request(`/api/fin/registry/tax-rates?tenantId=${otherTenant}`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { name: string }[] };
    expect(data.map((r) => r.name)).toContain("TVA A");
    expect(data.map((r) => r.name)).not.toContain("TVA B — secretul altcuiva");
  });

  it("[blocant] citirea după id a unei cote străine dă 404, nu conținut", async () => {
    const res = await app.request(`/api/fin/registry/tax-rates/${otherRateId}`);
    expect(res.status).toBe(404);
  });

  it("[blocant] planul de conturi al altei organizații nu se scurge prin query", async () => {
    const res = await app.request(`/api/fin/registry/chart-of-accounts?tenantId=${otherTenant}`);
    const { data } = (await res.json()) as { data: { accountName: string }[] };
    expect(data.map((r) => r.accountName)).not.toContain("Cont al altei organizații");
  });

  it("[blocant] `tenantId` din corp NU scrie cota în registrul altei organizații", async () => {
    const res = await app.request("/api/fin/registry/tax-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: otherTenant,
        country: "MD",
        kind: "vat",
        name: "Cotă strecurată",
        ratePct: "5.0000",
        effectiveFrom: "2026-02-01",
      }),
    });
    expect(res.status).toBe(201);
    const rows = await testDb.select().from(finTaxRates).where(eq(finTaxRates.name, "Cotă strecurată"));
    expect(rows).toHaveLength(1);
    expect(rows[0].tenantId).toBe(myTenant);
  });
});
