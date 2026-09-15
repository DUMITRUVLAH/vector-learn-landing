/**
 * @vitest-environment node
 * VM5-22: echipa PAR — INTEGRATION (rutele reale, PGlite, toate migrările).
 *
 * Cererea owner-ului (15.09.2026): doi colegi din aceeași echipă trebuie să-și vadă cererile între
 * ei — statutul, ce a trimis celălalt și CIORNELE nedepuse. Regula veche de proiect (VM5-02) oprea
 * exact la ciornă, deci preluarea muncii cuiva plecat rămânea imposibilă.
 *
 * Ce apără testele, dincolo de „merge":
 *   - echipa NU e o portiță de drepturi: nu deschide un plătitor la care omul n-are acces;
 *   - cine nu e în echipă nu vede ciorna nimănui (regula veche rămâne intactă);
 *   - lista și fișa spun ACELAȘI lucru despre aceeași cerere.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parRequests,
  parMembers,
  parPayerModules,
  parPayers,
  parPayerMembers,
} from "../db/schema/par";

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
let aticPayer: string;
let altPayer: string;
let cristina: string;
let iulian: string;
let strain: string; // membru PAR în aceeași organizație, dar în afara echipei
let adminUser: string;

let ciornaCristinei: string;
let cerereaCristinei: string;
let cerereaLuiIulian: string;
let cerereaDinAltPlatitor: string;

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

const as = (id: string) => {
  // Administratorul workspace-ului are rolul de tenant „admin" (de acolo îi vine par_admin-ul
  // implicit); ceilalți sunt utilizatori obișnuiți cu rol PAR.
  session = { id, tenantId, role: id === adminUser ? "admin" : "teacher", email: `${id}@t.md` };
};

async function listPar(query = ""): Promise<{ requests: { id: string; status: string }[] }> {
  const res = await app.request(`/api/par${query}`);
  return (await res.json()) as { requests: { id: string; status: string }[] };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parRoutes } = await import("../routes/par");
  const { parTeamsRoutes } = await import("../routes/parTeams");
  app = new Hono();
  app.route("/api/par/teams", parTeamsRoutes);
  app.route("/api/par", parRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-teams" }).returning();
  tenantId = tenant.id;

  const mkPayer = async (name: string) => {
    const [p] = await testDb.insert(parPayers).values({ tenantId, name }).returning();
    await testDb.insert(parPayerModules).values({ tenantId, payerId: p.id, moduleKey: "par", enabled: true });
    return p.id;
  };
  aticPayer = await mkPayer("ATIC");
  altPayer = await mkPayer("Alt plătitor");

  const mkUser = async (email: string, name: string, role = "teacher") => {
    const [u] = await testDb.insert(users).values({ tenantId, email, passwordHash: "x", name, role }).returning();
    return u.id;
  };
  cristina = await mkUser("cristina@ict.md", "Cristina Onicov");
  iulian = await mkUser("ilungu@ict.md", "Iulian Lungu");
  strain = await mkUser("strain@ict.md", "Coleg din afara echipei");
  adminUser = await mkUser("admin@ict.md", "Admin ATIC", "admin");

  for (const userId of [cristina, iulian, strain]) {
    await testDb.insert(parMembers).values({ tenantId, userId, role: "requestor" });
    await testDb.insert(parPayerMembers).values({ tenantId, payerId: aticPayer, userId });
  }
  // Doar Cristina lucrează și pe al doilea plătitor — de aici se vede că echipa nu lărgește aria.
  await testDb.insert(parPayerMembers).values({ tenantId, payerId: altPayer, userId: cristina });

  const mkPar = async (v: { requestNo: string; by: string; status: string; payerId: string }) => {
    const [p] = await testDb
      .insert(parRequests)
      .values({
        tenantId,
        requestNo: v.requestNo,
        requestedByUserId: v.by,
        payerId: v.payerId,
        purpose: "execute_payment",
        chargeTo: "program",
        status: v.status as typeof parRequests.$inferInsert.status,
        endUse: "Servicii",
        currency: "MDL",
        totalEstimatedCents: 100000,
        dateOfRequest: new Date("2026-09-10T00:00:00Z"),
      })
      .returning();
    return p.id;
  };
  ciornaCristinei = await mkPar({ requestNo: "PAR-2026-0100", by: cristina, status: "draft", payerId: aticPayer });
  cerereaCristinei = await mkPar({ requestNo: "PAR-2026-0101", by: cristina, status: "in_finance", payerId: aticPayer });
  cerereaLuiIulian = await mkPar({ requestNo: "PAR-2026-0102", by: iulian, status: "pending_approval", payerId: aticPayer });
  cerereaDinAltPlatitor = await mkPar({ requestNo: "PAR-2026-0103", by: cristina, status: "in_finance", payerId: altPayer });

  // Echipa se creează prin RUTA reală, ca administrator — nu prin insert direct.
  as(adminUser);
  const created = await app.request("/api/par/teams", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Granturi", user_ids: [cristina, iulian] }),
  });
  expect(created.status).toBe(201);
});

describe("echipa PAR — ce vede coechipierul", () => {
  it("îi deschide ciorna colegei de echipă (asta a cerut owner-ul)", async () => {
    as(iulian);
    const res = await app.request(`/api/par/${ciornaCristinei}`);
    expect(res.status).toBe(200);
  });

  it("nu deschide ciorna nimănui pentru cine NU e în echipă", async () => {
    as(strain);
    const res = await app.request(`/api/par/${ciornaCristinei}`);
    expect(res.status).toBe(404);
  });

  it("nu lărgește aria: cererea dintr-un plătitor nealocat rămâne închisă", async () => {
    as(iulian);
    const res = await app.request(`/api/par/${cerereaDinAltPlatitor}`);
    expect(res.status).toBe(404);
  });
});

describe("echipa PAR — lista", () => {
  it("scope=team arată cererile ambilor, ciorna inclusă", async () => {
    as(iulian);
    const { requests } = await listPar("?scope=team");
    const ids = requests.map((r) => r.id);
    expect(ids).toContain(cerereaLuiIulian);
    expect(ids).toContain(cerereaCristinei);
    expect(ids).toContain(ciornaCristinei);
    // Aria rămâne aria lui: plătitorul la care n-are acces nu apare nici în listă.
    expect(ids).not.toContain(cerereaDinAltPlatitor);
  });

  it("fără scope rămâne lista proprie — comportamentul vechi nu se schimbă", async () => {
    as(iulian);
    const { requests } = await listPar();
    expect(requests.map((r) => r.id)).toEqual([cerereaLuiIulian]);
  });

  it("scope=team pentru cine n-are echipă nu-i arată cererile altora", async () => {
    as(strain);
    const { requests } = await listPar("?scope=team");
    expect(requests).toEqual([]);
  });

  it("lista și fișa spun același lucru despre ciorna colegei", async () => {
    as(iulian);
    const { requests } = await listPar("?scope=team&status=draft");
    expect(requests.map((r) => r.id)).toContain(ciornaCristinei);
    expect((await app.request(`/api/par/${ciornaCristinei}`)).status).toBe(200);
  });
});

describe("administrarea echipelor", () => {
  it("un solicitant obișnuit nu poate crea sau vedea echipe", async () => {
    as(iulian);
    expect((await app.request("/api/par/teams")).status).toBe(403);
    const res = await app.request("/api/par/teams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Echipa mea" }),
    });
    expect(res.status).toBe(403);
  });

  it("GET /teams/my întoarce coechipierii, fără rol de administrator", async () => {
    as(iulian);
    const res = await app.request("/api/par/teams/my");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { teams: { name: string; members: { userId: string }[] }[]; teammateIds: string[] };
    expect(body.teams.map((t) => t.name)).toEqual(["Granturi"]);
    expect(body.teammateIds).toEqual([cristina]);
  });

  it("refuză o echipă cu nume duplicat", async () => {
    as(adminUser);
    const res = await app.request("/api/par/teams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Granturi" }),
    });
    expect(res.status).toBe(409);
  });

  it("scoaterea din echipă taie imediat vizibilitatea", async () => {
    as(adminUser);
    const teams = (await (await app.request("/api/par/teams")).json()) as { teams: { id: string; name: string }[] };
    const team = teams.teams.find((t) => t.name === "Granturi")!;
    expect((await app.request(`/api/par/teams/${team.id}/members/${iulian}`, { method: "DELETE" })).status).toBe(200);

    as(iulian);
    expect((await app.request(`/api/par/${ciornaCristinei}`)).status).toBe(404);

    // …și readăugarea o repune.
    as(adminUser);
    const back = await app.request(`/api/par/teams/${team.id}/members`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_id: iulian }),
    });
    expect(back.status).toBe(200);
    as(iulian);
    expect((await app.request(`/api/par/${ciornaCristinei}`)).status).toBe(200);
  });
});
