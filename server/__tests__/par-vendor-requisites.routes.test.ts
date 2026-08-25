/**
 * @vitest-environment node
 *
 * Registrul de beneficiari — rechizitele bancare ajung în coloane separate.
 *
 * Bug-ul raportat de contabilă (2026-08-25): rândul din „Furnizori / Plătitori" arăta
 *   Bancă = BC'MAIB'S.A. sucursala Stefan cel Mare, AGRNMD2X885 c.f./ nr.TVA 1014600022332 / ф.
 * adică banca, codul bancar și codul fiscal, toate într-un câmp — „tot e intro linie la tine".
 *
 * Regula CLAUDE.md §3.5.1quater: fiecare comportament nou e CHEMAT pe ruta reală, cu date
 * realiste, și i se verifică statusul + forma răspunsului. Aici trec prin HTTP: POST (creare),
 * PATCH (editare) și POST /actions/normalize (repararea rândurilor deja salvate).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parVendors } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let userA: string;

vi.mock("../db/client", () => ({ get db() { return testDb; }, closeDb: async () => {} }));
vi.mock("../auth/session", () => ({
  SESSION_COOKIE: "vl_session",
  getSessionUser: vi.fn(async (token: string) => {
    if (token !== "a") return null;
    const user = await testDb.query.users.findFirst({ where: eq(users.id, userA) });
    return user ? { session: { id: "s" }, user } : null;
  }),
}));

import { parVendorsRoutes } from "../routes/parVendors";
import { Hono } from "hono";

const app = new Hono();
app.route("/api/par/vendors", parVendorsRoutes);

/** Rândul exact raportat de contabilă. */
const MERGED_BANK =
  "BC'MAIB'S.A. sucursala Stefan cel Mare, AGRNMD2X885 c.f./ nr.TVA 1014600022332 / ф.";

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

interface VendorRow {
  id: string;
  name: string;
  bank: string | null;
  bicSwift: string | null;
  vatCode: string | null;
  idnp: string | null;
  iban: string | null;
}

const post = (p: string, body?: unknown) =>
  app.request(p, {
    method: "POST",
    headers: { cookie: "vl_session=a", "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const patch = (p: string, body: unknown) =>
  app.request(p, {
    method: "PATCH",
    headers: { cookie: "vl_session=a", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const get = (p: string) => app.request(p, { headers: { cookie: "vl_session=a" } });

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema }) as unknown as typeof testDb;
  await applyMigrations(pglite);

  const [t] = await testDb
    .insert(tenants)
    .values({ name: "ONG A", slug: "ong-a", plan: "starter", appKind: "business" })
    .returning();
  tenantA = t.id;
  // Rol de tenant „admin" = par_admin implicit (requirePARRole), deci poate scrie și repara.
  const [u] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "a@ong.md", passwordHash: "x", name: "A", role: "admin" })
    .returning();
  userA = u.id;
}, 90_000);

afterAll(async () => {
  await pglite.close();
});

describe("POST /api/par/vendors — separă rechizitele lipite", () => {
  it("desparte banca, codul bancar și codul fiscal dintr-un singur câmp „Bancă”", async () => {
    const res = await post("/api/par/vendors", {
      name: "NEWS MAKER SRL",
      iban: "MD03AG000000022512323419",
      bank: MERGED_BANK,
    });
    expect(res.status).toBe(201);
    const row = (await res.json()) as VendorRow;

    // Aici pica înainte: tot șirul rămânea în `bank`, iar celelalte coloane erau goale.
    expect(row.bank).toBe("BC'MAIB'S.A. sucursala Stefan cel Mare");
    expect(row.bicSwift).toBe("AGRNMD2X885");
    expect(row.idnp).toBe("1014600022332");
    expect(row.iban).toBe("MD03AG000000022512323419");
  });

  it("nu atinge un nume de bancă deja curat", async () => {
    const res = await post("/api/par/vendors", {
      name: "Curat SRL",
      iban: "MD24AG000225100013104168",
      bank: 'BC "Victoriabank" S.A.',
      vat_code: "0301234",
    });
    expect(res.status).toBe(201);
    const row = (await res.json()) as VendorRow;
    expect(row.bank).toBe('BC "Victoriabank" S.A.');
    expect(row.vatCode).toBe("0301234");
    expect(row.bicSwift).toBeNull();
  });

  it("nu suprascrie un cod fiscal scris explicit de om", async () => {
    const res = await post("/api/par/vendors", {
      name: "Explicit SRL",
      iban: "MD11AG000000000000000001",
      idnp: "1003600000001",
      bank: MERGED_BANK,
    });
    expect(res.status).toBe(201);
    const row = (await res.json()) as VendorRow;
    expect(row.idnp).toBe("1003600000001");
    // …dar codul bancar, care lipsea, tot se completează.
    expect(row.bicSwift).toBe("AGRNMD2X885");
  });
});

describe("PATCH /api/par/vendors/:id", () => {
  it("păstrează codul bancar deja salvat când se re-lipește textul brut", async () => {
    const created = (await (
      await post("/api/par/vendors", {
        name: "Patch SRL",
        iban: "MD11AG000000000000000002",
        bic_swift: "MOLDMD2X322",
        bank: 'BC "Moldindconbank" S.A.',
      })
    ).json()) as VendorRow;

    const res = await patch(`/api/par/vendors/${created.id}`, { bank: MERGED_BANK });
    expect(res.status).toBe(200);
    const row = (await res.json()) as VendorRow;
    expect(row.bank).toBe("BC'MAIB'S.A. sucursala Stefan cel Mare");
    // Schimbarea unui cod bancar salvat redirecționează bani — extragerea n-are voie s-o facă.
    expect(row.bicSwift).toBe("MOLDMD2X322");
  });

  it("întoarce 404 pentru un id inexistent, nu 500", async () => {
    const res = await patch("/api/par/vendors/00000000-0000-4000-8000-000000000000", { name: "X" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/par/vendors/actions/normalize — repară rândurile vechi", () => {
  it("desparte un rând salvat înainte de fix și e sigur de rulat de două ori", async () => {
    // Exact situația din producție: rândul e deja în bază, îngrămădit.
    const [legacy] = await testDb
      .insert(parVendors)
      .values({ tenantId: tenantA, name: "LEGACY SRL", bank: MERGED_BANK, active: true })
      .returning();

    const res = await post("/api/par/vendors/actions/normalize");
    // Calea are două segmente tocmai ca parUuidGuard să n-o citească drept id → altfel ar da 404.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; scanned: number; updated: number };
    expect(body.ok).toBe(true);
    expect(body.updated).toBeGreaterThanOrEqual(1);

    const after = await testDb.query.parVendors.findFirst({ where: eq(parVendors.id, legacy.id) });
    expect(after?.bank).toBe("BC'MAIB'S.A. sucursala Stefan cel Mare");
    expect(after?.bicSwift).toBe("AGRNMD2X885");
    expect(after?.idnp).toBe("1014600022332");

    // A doua rulare nu mai are ce separa — altfel butonul ar „repara" la nesfârșit.
    const second = (await (await post("/api/par/vendors/actions/normalize")).json()) as {
      updated: number;
    };
    expect(second.updated).toBe(0);
  });
});

describe("GET /api/par/vendors", () => {
  it("expune codul de TVA ca al lui câmp, ca listarea să poată avea coloană", async () => {
    const res = await get("/api/par/vendors?q=Curat");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vendors: VendorRow[] };
    const hit = body.vendors.find((v) => v.name === "Curat SRL");
    expect(hit).toBeDefined();
    expect(hit!.vatCode).toBe("0301234");
  });
});
