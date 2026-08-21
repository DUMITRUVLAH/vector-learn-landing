/**
 * @vitest-environment node
 *
 * Plăți INTERNAȚIONALE — teste de integrare pe rutele reale + PGlite + toate migrările.
 * §3.5.1quater: chemăm efectiv endpoint-urile și verificăm statusul + ce a rămas în DB.
 *
 * Bug-ul reparat (raportat de owner, 2026-08-21): un beneficiar estonian real —
 * `EE162200221068653841` / Swedbank AS / HABAEE2X, cod fiscal `48410210022` — era respins de
 * `PATCH /api/par/:id` cu „invalid_iban: must be a valid MD IBAN" și de `POST /api/par/vendors`
 * la fel. Ambele rute presupuneau că orice plată e locală.
 *
 * Ce blochează testele de aici:
 *   1. un IBAN valid din ORICE țară e acceptat pe PAR și în registrul de beneficiari
 *   2. un cod fiscal străin (11 cifre) NU mai e respins pentru că nu are 13 cifre…
 *   3. …și încape efectiv în coloană (migrarea 0140: varchar(13) → varchar(50))
 *   4. un IBAN cu checksum stricat rămâne respins — relaxarea nu a devenit „acceptă orice"
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parMembers, parPayers, parPayerModules, parVendors } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let parId: string;
let payerId: string;

vi.mock("../db/client", () => ({
  get db() { return testDb; },
  closeDb: async () => {},
}));
vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "manager", email: "finance@vector.md" });
    await next();
  },
}));

import { Hono } from "hono";
let app: Hono;

/** Beneficiarul estonian din raportul owner-ului. */
const EE = {
  iban: "EE162200221068653841",
  fiscal: "48410210022",
  bic: "HABAEE2X",
  bank: "Swedbank AS",
  name: "Bordei Viorica",
};

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

const patchPar = (body: unknown) =>
  app.request(`/api/par/${parId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const postVendor = (body: unknown) =>
  app.request("/api/par/vendors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const [{ parRoutes }, { parVendorsRoutes }] = await Promise.all([
    import("../routes/par"),
    import("../routes/parVendors"),
  ]);
  app = new Hono();
  // vendors ÎNAINTE de parRoutes: altfel "/vendors" ar fi prins de "/:id".
  app.route("/api/par/vendors", parVendorsRoutes);
  app.route("/api/par", parRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-intl" }).returning();
  tenantId = tenant.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "finance@vector.md", passwordHash: "x", name: "Violeta", role: "manager" })
    .returning();
  userId = u.id;
  await testDb.insert(parMembers).values({ tenantId, userId, role: "par_admin" });

  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: "PAR-2026-9001",
      requestedByUserId: userId,
      purpose: "execute_payment",
      status: "draft",
      payerId: payerId,
      currency: "EUR",
      totalEstimatedCents: 150000,
      dateOfRequest: new Date("2026-08-21T00:00:00Z"),
    })
    .returning();
  parId = par.id;
}, 120_000);

afterAll(async () => {
  await pglite.close();
});

describe("PATCH /api/par/:id — beneficiar internațional", () => {
  it("acceptă IBAN estonian + cod fiscal de 11 cifre și le salvează integral", async () => {
    const res = await patchPar({
      payee_name: EE.name,
      payee_iban: EE.iban,
      payee_idnp: EE.fiscal,
      payee_bank: EE.bank,
    });
    expect(res.status).toBe(200);

    const row = await testDb.query.parRequests.findFirst({ where: eq(parRequests.id, parId) });
    expect(row?.payeeIban).toBe(EE.iban);
    expect(row?.payeeIdnp).toBe(EE.fiscal);
  });

  it("acceptă și un cod fiscal lung (>13 caractere) — migrarea 0140 a lărgit coloana", async () => {
    const longVat = "DE123456789012345678";
    const res = await patchPar({ payee_idnp: longVat });
    expect(res.status).toBe(200);
    const row = await testDb.query.parRequests.findFirst({ where: eq(parRequests.id, parId) });
    expect(row?.payeeIdnp).toBe(longVat); // NU trunchiat la 13
  });

  it("IBAN cu checksum stricat → 400 (relaxarea nu a devenit acceptă-orice)", async () => {
    const res = await patchPar({ payee_iban: "EE172200221068653841" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; reason?: string };
    expect(body.error).toContain("invalid_iban");
    expect(body.reason).toBe("bad_checksum");
  });

  it("IBAN cu lungime greșită pentru țara lui → 400, cu mesaj despre ȚARA ACEEA", async () => {
    const res = await patchPar({ payee_iban: "EE1622002210686538" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; reason?: string };
    expect(body.reason).toBe("bad_length");
    expect(body.error).toContain("Estonia");
  });

  it("IBAN moldovenesc valid continuă să meargă (fără regresie pe cazul obișnuit)", async () => {
    const res = await patchPar({ payee_iban: "MD24AG000225100013104168", payee_idnp: "1002600012345" });
    expect(res.status).toBe(200);
  });
});

describe("POST /api/par/vendors — registrul de beneficiari", () => {
  it("salvează un beneficiar străin cu IBAN non-MD, BIC și cod fiscal de 11 cifre", async () => {
    const res = await postVendor({
      name: EE.name,
      iban: EE.iban,
      idnp: EE.fiscal,
      bank: EE.bank,
      bic_swift: EE.bic,
      legal_address: "s. Kalme, municipalitatea Elva, Estonia",
    });
    expect([200, 201]).toContain(res.status);

    const saved = await testDb.query.parVendors.findFirst({ where: eq(parVendors.iban, EE.iban) });
    expect(saved?.idnp).toBe(EE.fiscal);
    expect(saved?.bicSwift).toBe(EE.bic);
  });

  it("IBAN invalid → 400 (nu intră gunoi în registru)", async () => {
    const res = await postVendor({ name: "Fake SRL", iban: "XX00NOTANIBAN0000000" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("invalid_iban");
  });
});
