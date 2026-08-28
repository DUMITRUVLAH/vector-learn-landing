/**
 * @vitest-environment node
 * DE CE nu se deschide o cerere PAR — INTEGRATION (ruta reală, PGlite, toate migrările).
 *
 * Incidentul (2026-08-28): linkul din emailul „PAR-2026-0003 — ready for payment" a fost deschis
 * într-o sesiune logată în ALT workspace. Cererea exista, drepturile erau bune, dar `GET
 * /api/par/:id` scopează pe `tenantId`-ul sesiunii → 404. Ecranul afișa doar codul `not_found`,
 * deci nimeni nu putea deduce că problema e contul, nu cererea.
 *
 * Testele cer, pentru fiecare cale de refuz: status 404 (nu confirmăm existența unui id din alt
 * workspace printr-un 403), `error: "not_found"` (compatibilitate), DAR și un `reason` + contextul
 * contului curent. Se testează ACȚIUNEA (endpoint-ul e chiar apelat), nu forma unei funcții.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
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
  parProjects,
  parProjectMembers,
  parPayerMembers,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

/** Sesiunea curentă — fiecare test o comută pe contul care deschide linkul. */
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

interface Denial {
  error: string;
  reason?: string;
  currentEmail?: string | null;
  currentWorkspace?: string | null;
  workspace?: string;
}

// Workspace-ul sesiunii (cel „greșit") și cel care deține cererea.
let vectorTenant: string;
let aticTenant: string;
// Conturi
let vlahBusiness: string; // în Vector, fără cont în ATIC — cazul din incident
let dumitruVector: string; // vlahdumitru@gmail.com în Vector
let anaAtic: string; // autor în ATIC
let finantePropriu: string; // finance în Vector, fără proiect alocat
let solicitantSimplu: string; // fără roluri PAR în Vector
// Cereri
let parInAtic: string;
let parCiornaAltcuiva: string;
let parInAfaraAriei: string;
let parModulOprit: string;

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

async function openPar(id: string): Promise<{ status: number; body: Denial }> {
  const res = await app.request(`/api/par/${id}`);
  return { status: res.status, body: (await res.json()) as Denial };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parRoutes } = await import("../routes/par");
  app = new Hono();
  app.route("/api/par", parRoutes);

  // ── Workspace-ul sesiunii: „Vector" ───────────────────────────────────────
  const [vector] = await testDb.insert(tenants).values({ name: "Vector", slug: "vector-ar" }).returning();
  vectorTenant = vector.id;
  const [vectorPayer] = await testDb
    .insert(parPayers)
    .values({ tenantId: vectorTenant, name: "Vector SRL" })
    .returning();
  await testDb
    .insert(parPayerModules)
    .values({ tenantId: vectorTenant, payerId: vectorPayer.id, moduleKey: "par", enabled: true });
  const [vectorProject] = await testDb
    .insert(parProjects)
    .values({ tenantId: vectorTenant, name: "Proiect Vector", payerId: vectorPayer.id, active: true })
    .returning();

  const mkUser = async (tenantId: string, email: string, role: string, name: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name, role })
      .returning();
    return u.id;
  };

  vlahBusiness = await mkUser(vectorTenant, "vlah.business@gmail.com", "teacher", "Vlah Dumitru");
  dumitruVector = await mkUser(vectorTenant, "vlahdumitru@gmail.com", "teacher", "Dumitru V");
  finantePropriu = await mkUser(vectorTenant, "finante@vector.md", "teacher", "Finanțe Vector");
  solicitantSimplu = await mkUser(vectorTenant, "simplu@vector.md", "teacher", "Solicitant Simplu");
  const autorVector = await mkUser(vectorTenant, "autor@vector.md", "teacher", "Autor Vector");

  // Rolurile PAR: „elevat" pentru cei care trebuie să treacă de prima poartă.
  for (const userId of [vlahBusiness, dumitruVector, finantePropriu]) {
    await testDb.insert(parMembers).values({ tenantId: vectorTenant, userId, role: "finance" });
  }

  // ── Workspace-ul care deține cererea: „ATIC" ──────────────────────────────
  const [atic] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-ar" }).returning();
  aticTenant = atic.id;
  const [aticPayer] = await testDb.insert(parPayers).values({ tenantId: aticTenant, name: "ATIC" }).returning();
  await testDb
    .insert(parPayerModules)
    .values({ tenantId: aticTenant, payerId: aticPayer.id, moduleKey: "par", enabled: true });
  anaAtic = await mkUser(aticTenant, "ana@atic.md", "teacher", "Ana ATIC");
  // În prod oamenii sunt alocați plătitorului; fără rândul ăsta nici autorul nu-și vede cererea.
  await testDb.insert(parPayerMembers).values({ tenantId: aticTenant, payerId: aticPayer.id, userId: anaAtic });
  // Același email ca `dumitruVector`, dar cont separat în ATIC — exact duplicatul din prod.
  await mkUser(aticTenant, "vlahdumitru@gmail.com", "teacher", "Dumitru V (ATIC)");

  const mkPar = async (v: Partial<typeof parRequests.$inferInsert> & { tenantId: string; requestNo: string; requestedByUserId: string }) => {
    const [p] = await testDb
      .insert(parRequests)
      .values({
        purpose: "execute_payment",
        chargeTo: "program",
        status: "in_finance",
        endUse: "Servicii",
        currency: "MDL",
        totalEstimatedCents: 100000,
        dateOfRequest: new Date("2026-08-25T00:00:00Z"),
        ...v,
      })
      .returning();
    return p.id;
  };

  parInAtic = await mkPar({
    tenantId: aticTenant,
    requestNo: "PAR-2026-0003",
    requestedByUserId: anaAtic,
    payerId: aticPayer.id,
  });
  parCiornaAltcuiva = await mkPar({
    tenantId: vectorTenant,
    requestNo: "PAR-2026-0011",
    requestedByUserId: autorVector,
    payerId: vectorPayer.id,
    projectId: vectorProject.id,
    status: "draft",
  });
  parInAfaraAriei = await mkPar({
    tenantId: vectorTenant,
    requestNo: "PAR-2026-0012",
    requestedByUserId: autorVector,
    payerId: vectorPayer.id,
    projectId: vectorProject.id,
  });

  // Un plătitor din Vector fără modulul PAR activat, cu utilizatorul alocat pe proiectul lui
  // (deci trece de aria de acces și pică exact pe entitlement).
  const [payerFaraModul] = await testDb
    .insert(parPayers)
    .values({ tenantId: vectorTenant, name: "Vector fără modul" })
    .returning();
  const [proiectFaraModul] = await testDb
    .insert(parProjects)
    .values({ tenantId: vectorTenant, name: "Proiect fără modul", payerId: payerFaraModul.id, active: true })
    .returning();
  await testDb
    .insert(parProjectMembers)
    .values({ tenantId: vectorTenant, projectId: proiectFaraModul.id, userId: finantePropriu });
  parModulOprit = await mkPar({
    tenantId: vectorTenant,
    requestNo: "PAR-2026-0013",
    requestedByUserId: autorVector,
    payerId: payerFaraModul.id,
    projectId: proiectFaraModul.id,
  });

  session = { id: vlahBusiness, tenantId: vectorTenant, role: "teacher", email: "vlah.business@gmail.com" };
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("GET /api/par/:id — refuzul spune DE CE", () => {
  it("[blocant] linkul din email deschis din alt workspace → 404 cu reason=other_workspace_no_account (incidentul)", async () => {
    session = { id: vlahBusiness, tenantId: vectorTenant, role: "teacher", email: "vlah.business@gmail.com" };
    const { status, body } = await openPar(parInAtic);

    expect(status).toBe(404); // NU 403 — nu confirmăm existența prin cod de status
    expect(body.error).toBe("not_found"); // contractul vechi rămâne
    expect(body.reason).toBe("other_workspace_no_account");
    expect(body.currentEmail).toBe("vlah.business@gmail.com");
    expect(body.currentWorkspace).toBe("Vector");
    // Nu divulgăm numele workspace-ului care deține cererea unui email fără cont acolo.
    expect(body.workspace).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("ATIC");
  });

  it("[blocant] același email are cont în workspace-ul cererii → reason=other_workspace + numele lui", async () => {
    session = { id: dumitruVector, tenantId: vectorTenant, role: "teacher", email: "vlahdumitru@gmail.com" };
    const { status, body } = await openPar(parInAtic);

    expect(status).toBe(404);
    expect(body.reason).toBe("other_workspace");
    expect(body.workspace).toBe("ATIC");
    expect(body.currentWorkspace).toBe("Vector");
  });

  it("[blocant] email scris cu majuscule tot găsește contul geamăn (comparație case-insensitive)", async () => {
    session = { id: dumitruVector, tenantId: vectorTenant, role: "teacher", email: "VlahDumitru@Gmail.com" };
    const { body } = await openPar(parInAtic);
    expect(body.reason).toBe("other_workspace");
  });

  it("[normal] id inexistent → reason=unknown_id", async () => {
    session = { id: vlahBusiness, tenantId: vectorTenant, role: "teacher", email: "vlah.business@gmail.com" };
    const { status, body } = await openPar("11111111-2222-4333-8444-555555555555");
    expect(status).toBe(404);
    expect(body.reason).toBe("unknown_id");
  });

  it("[normal] id care nu e uuid → reason=unknown_id, fără 500", async () => {
    const { status, body } = await openPar("nu-e-uuid");
    expect(status).toBe(404);
    expect(body.reason).toBe("unknown_id");
  });

  it("[blocant] ciorna altcuiva → reason=draft_private", async () => {
    session = { id: finantePropriu, tenantId: vectorTenant, role: "teacher", email: "finante@vector.md" };
    const { status, body } = await openPar(parCiornaAltcuiva);
    expect(status).toBe(404);
    expect(body.reason).toBe("draft_private");
  });

  it("[blocant] fără rol PAR și fără să fii autorul → reason=not_requestor", async () => {
    session = { id: solicitantSimplu, tenantId: vectorTenant, role: "teacher", email: "simplu@vector.md" };
    const { status, body } = await openPar(parInAfaraAriei);
    expect(status).toBe(404);
    expect(body.reason).toBe("not_requestor");
  });

  it("[blocant] proiect la care nu ești alocat → reason=out_of_scope", async () => {
    session = { id: finantePropriu, tenantId: vectorTenant, role: "teacher", email: "finante@vector.md" };
    const { status, body } = await openPar(parInAfaraAriei);
    expect(status).toBe(404);
    expect(body.reason).toBe("out_of_scope");
  });

  it("[blocant] modulul PAR oprit pe organizația cererii → reason=module_disabled", async () => {
    session = { id: finantePropriu, tenantId: vectorTenant, role: "teacher", email: "finante@vector.md" };
    const { status, body } = await openPar(parModulOprit);
    expect(status).toBe(404);
    expect(body.reason).toBe("module_disabled");
  });

  it("[blocant] cine ARE dreptul primește cererea, nu un motiv de refuz", async () => {
    session = { id: anaAtic, tenantId: aticTenant, role: "teacher", email: "ana@atic.md" };
    const res = await app.request(`/api/par/${parInAtic}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { requestNo?: string; par?: { requestNo?: string } };
    expect(body.requestNo ?? body.par?.requestNo).toBe("PAR-2026-0003");
  });
});
