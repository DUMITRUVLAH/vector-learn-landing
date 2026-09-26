/**
 * @vitest-environment node
 *
 * NAV-12 — POST /api/fin/parties/from-crm-company: partenerul FinDesk al unei firme din CRM.
 *
 * Contractele din CRM se leagă de `fin_parties`. Endpointul găsește partenerul după IDNO, apoi după
 * nume, și îl creează o singură dată. Ce contează: idempotența (două click-uri ≠ doi parteneri) și
 * izolarea (firma altui workspace nu devine partenerul tău).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { crmCompanies } from "../db/schema/crmCompanies";
import { finParties } from "../db/schema/finParties";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let tenantB: string;
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

const post = (companyId: string) =>
  app.request("/api/fin/parties/from-crm-company", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companyId }),
  });

let withIdno: string;
let noIdno: string;
let otherTenantCompany: string;

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { finPartiesRoutes } = await import("../routes/finParties");
  app = new Hono();
  app.route("/api/fin/parties", finPartiesRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Alfa", slug: "alfa-nav12" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Beta", slug: "beta-nav12" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;
  const [uA] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@alfa-nav12.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  currentUser = { id: uA.id, tenantId: tenantA, role: "admin", email: uA.email };

  const [c1] = await testDb
    .insert(crmCompanies)
    .values({ tenantId: tenantA, name: "Alfa Soft SRL", idno: "1003600012345", email: "office@alfasoft.md", address: "Chișinău" })
    .returning();
  const [c2] = await testDb.insert(crmCompanies).values({ tenantId: tenantA, name: "  Beta Grup  ", idno: "nu știu" }).returning();
  const [c3] = await testDb.insert(crmCompanies).values({ tenantId: tenantB, name: "Străin SRL", idno: "1003600099999" }).returning();
  withIdno = c1.id;
  noIdno = c2.id;
  otherTenantCompany = c3.id;
});

afterAll(async () => {
  await pglite.close();
});

describe("POST /api/fin/parties/from-crm-company", () => {
  it("[blocant] creează partenerul o singură dată — al doilea apel îl refolosește", async () => {
    const first = await post(withIdno);
    expect(first.status).toBe(201);
    const a = (await first.json()) as { data: { id: string; idno: string; email: string; kind: string }; created: boolean };
    expect(a.created).toBe(true);
    expect(a.data).toMatchObject({ idno: "1003600012345", email: "office@alfasoft.md", kind: "client" });

    const second = await post(withIdno);
    expect(second.status).toBe(200);
    const b = (await second.json()) as { data: { id: string }; created: boolean };
    expect(b).toMatchObject({ created: false, data: { id: a.data.id } });

    const rows = await testDb.select().from(finParties).where(eq(finParties.tenantId, tenantA));
    expect(rows.filter((r) => r.idno === "1003600012345")).toHaveLength(1);
  });

  it("[blocant] găsește un partener FinDesk existent după IDNO, chiar cu alt nume", async () => {
    await testDb.insert(finParties).values({ tenantId: tenantA, kind: "both", name: "ALFA SOFT (vechi)", country: "MD", idno: "1003600077777" });
    const [c] = await testDb.insert(crmCompanies).values({ tenantId: tenantA, name: "Alfa Nou", idno: "1003600077777" }).returning();
    const res = await post(c.id);
    const body = (await res.json()) as { data: { name: string }; created: boolean };
    expect(body).toMatchObject({ created: false, data: { name: "ALFA SOFT (vechi)" } });
  });

  it("[normal] un IDNO invalid din CRM nu ajunge în FinDesk; numele e potrivit fără spații și majuscule", async () => {
    const res = await post(noIdno);
    const body = (await res.json()) as { data: { id: string; idno: string | null; name: string } };
    expect(body.data.idno).toBeNull();
    const again = (await (await post(noIdno)).json()) as { data: { id: string }; created: boolean };
    expect(again).toMatchObject({ created: false, data: { id: body.data.id } });
  });

  it("[blocant] firma altui workspace → 404, fără partener creat", async () => {
    const res = await post(otherTenantCompany);
    expect(res.status).toBe(404);
    const leaked = await testDb.select().from(finParties).where(eq(finParties.idno, "1003600099999"));
    expect(leaked).toHaveLength(0);
  });
});
