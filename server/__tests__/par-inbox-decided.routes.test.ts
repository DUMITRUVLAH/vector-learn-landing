/**
 * @vitest-environment node
 *
 * „Ce am aprobat eu până acum?" — GET /api/par/inbox?scope=decided (cererea owner-ului, 2026-09-10).
 *
 * Inboxul arată strict pașii care AȘTEAPTĂ semnătura ta, deci o cerere dispare din el în secunda
 * în care ai decis-o. Testele de aici acoperă lista care le ține minte.
 *
 * INTEGRATION (rute reale, PGlite, toate migrările). Deciziile se iau prin rutele de producție
 * (POST /approve, /reject, /request-changes), nu prin inserturi în `par_audit` — altfel testul ar
 * verifica jurnalul pe care tot el l-a scris.
 *
 * Acoperit:
 *   1. [blocant] După aprobare, cererea iese din /inbox și apare în ?scope=decided cu
 *      my_decision="approved" și my_decided_at completat.
 *   2. [blocant] Istoricul e al MEU: ce a decis alt aprobator nu apare la mine.
 *   3. [blocant] Pas atribuit pe ROL (approver_user_id NULL) — apare tot în istoricul celui care
 *      l-a semnat. Ăsta e motivul pentru care sursa e par_audit, nu par_approvals: pasul nu-și
 *      rescrie approver_user_id la decizie.
 *   4. [normal] Respingerea și cererea de modificări apar cu decizia lor, nu ca aprobări.
 *   5. [blocant] Scopul: cine nu mai are acces la plătitor nu-și vede cererile prin istoric.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parApprovals, parMembers, parPayerModules, parPayers } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let requestorId: string;
let approverAId: string;
let approverBId: string;
let payerId: string;
/** Cine face cererea și cu ce rol de tenant — schimbate per test, ca în par-urgent.routes.test.ts. */
let callerUserId: () => string;
let callerTenantRole: () => string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: callerUserId(), tenantId, role: callerTenantRole(), email: "test@vector.md" });
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

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

interface DecidedRow {
  id: string;
  requestNo: string;
  status: string;
  my_decision: string;
  my_decided_at: string | null;
}

const decidedAs = async (userId: string, role = "manager"): Promise<DecidedRow[]> => {
  const prevUser = callerUserId;
  const prevRole = callerTenantRole;
  callerUserId = () => userId;
  callerTenantRole = () => role;
  try {
    const res = await app.request("/api/par/inbox?scope=decided");
    expect(res.status).toBe(200);
    return ((await res.json()) as { inbox: DecidedRow[] }).inbox;
  } finally {
    callerUserId = prevUser;
    callerTenantRole = prevRole;
  }
};

const pendingAs = async (userId: string): Promise<{ id: string }[]> => {
  const prev = callerUserId;
  callerUserId = () => userId;
  try {
    const res = await app.request("/api/par/inbox");
    expect(res.status).toBe(200);
    return ((await res.json()) as { inbox: { id: string }[] }).inbox;
  } finally {
    callerUserId = prev;
  }
};

/** O cerere depusă, cu un singur pas de aprobare activ. `approverUserId: null` = pas pe rol. */
async function seedPar(requestNo: string, approverUserId: string | null): Promise<string> {
  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo,
      requestedByUserId: requestorId,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "pending_approval",
      payerId,
      currency: "MDL",
      totalEstimatedCents: 250000,
      dateOfRequest: new Date("2026-07-01T00:00:00Z"),
      submittedAt: new Date("2026-07-01T00:00:00Z"),
    })
    .returning();
  await testDb.insert(parApprovals).values({
    tenantId,
    parId: par.id,
    step: 1,
    approverUserId,
    approverRoleLabel: "Aprobator",
    decision: "pending",
    locked: false,
  });
  return par.id;
}

const post = async (url: string, body: unknown) =>
  app.request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parApprovalsRoutes } = await import("../routes/parApprovals");
  app = new Hono();
  app.route("/api/par", parApprovalsRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC Test", slug: "atic-test-decided" }).returning();
  tenantId = tenant.id;

  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC Test", active: true }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });

  const mkUser = async (email: string, name: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name, role: "manager" })
      .returning();
    return u.id;
  };
  requestorId = await mkUser("requestor@vector.md", "Ion Solicitantul");
  approverAId = await mkUser("approver-a@vector.md", "Ana Aprobatoarea");
  approverBId = await mkUser("approver-b@vector.md", "Boris Aprobatorul");
  callerUserId = () => requestorId;
  callerTenantRole = () => "manager";

  await testDb.insert(parMembers).values([
    { tenantId, userId: requestorId, role: "requestor" },
    { tenantId, userId: approverAId, role: "approver" },
    { tenantId, userId: approverBId, role: "approver" },
  ]);
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("GET /api/par/inbox?scope=decided — istoricul deciziilor mele", () => {
  it("[blocant] cererea aprobată iese din inbox și intră în istoric cu decizia și data ei", async () => {
    const parId = await seedPar("PAR-2026-DEC1", approverAId);

    expect((await pendingAs(approverAId)).map((r) => r.id)).toContain(parId);

    callerUserId = () => approverAId;
    const res = await post(`/api/par/${parId}/approve`, { signatureName: "Ana Aprobatoarea" });
    expect(res.status).toBe(200);
    callerUserId = () => requestorId;

    expect((await pendingAs(approverAId)).map((r) => r.id)).not.toContain(parId);

    const history = await decidedAs(approverAId);
    const row = history.find((r) => r.id === parId);
    expect(row).toBeDefined();
    expect(row!.my_decision).toBe("approved");
    expect(row!.my_decided_at).toBeTruthy();
    expect(row!.requestNo).toBe("PAR-2026-DEC1");
  });

  it("[blocant] istoricul e al meu: ce a decis alt aprobator nu apare la mine", async () => {
    const parId = await seedPar("PAR-2026-DEC2", approverBId);

    callerUserId = () => approverBId;
    expect((await post(`/api/par/${parId}/approve`, {})).status).toBe(200);
    callerUserId = () => requestorId;

    expect((await decidedAs(approverBId)).map((r) => r.id)).toContain(parId);
    expect((await decidedAs(approverAId)).map((r) => r.id)).not.toContain(parId);
  });

  it("[blocant] un pas atribuit pe ROL apare în istoricul celui care l-a semnat", async () => {
    // par_approvals.approver_user_id rămâne NULL după decizie, deci chain-ul nu poate spune cine a
    // semnat — jurnalul de audit poate. Fără asta, aprobatorii pe rol ar avea istoricul gol.
    const parId = await seedPar("PAR-2026-DEC3", null);

    callerUserId = () => approverAId;
    expect((await post(`/api/par/${parId}/approve`, {})).status).toBe(200);
    callerUserId = () => requestorId;

    const row = (await decidedAs(approverAId)).find((r) => r.id === parId);
    expect(row?.my_decision).toBe("approved");
    expect((await decidedAs(approverBId)).map((r) => r.id)).not.toContain(parId);
  });

  it("[normal] respingerea și cererea de modificări își păstrează decizia", async () => {
    const rejectedId = await seedPar("PAR-2026-DEC4", approverAId);
    const changesId = await seedPar("PAR-2026-DEC5", approverAId);

    callerUserId = () => approverAId;
    expect((await post(`/api/par/${rejectedId}/reject`, { comment: "Lipsesc ofertele" })).status).toBe(200);
    expect((await post(`/api/par/${changesId}/request-changes`, { comment: "Adaugă contractul" })).status).toBe(200);
    callerUserId = () => requestorId;

    const history = await decidedAs(approverAId);
    expect(history.find((r) => r.id === rejectedId)?.my_decision).toBe("rejected");
    expect(history.find((r) => r.id === rejectedId)?.status).toBe("rejected");
    expect(history.find((r) => r.id === changesId)?.my_decision).toBe("changes_requested");
  });

  it("[blocant] cererea proprie, semnată automat la depunere, apare în istoric", async () => {
    // Rândul 14 (SOLICITANT) se scrie `approved` la trimitere, fără eveniment de audit. Aprobatorul
    // care își depune propria cerere vedea „autoapprove" pe ecranul cererii, dar nimic în istoric.
    const parId = await seedPar("PAR-2026-DEC6", approverBId);
    await testDb.insert(parApprovals).values({
      tenantId,
      parId,
      step: 0,
      approverUserId: approverAId,
      approverRoleLabel: "Requestor",
      decision: "approved",
      decidedAt: new Date("2026-07-02T09:00:00Z"),
      locked: false,
    });

    const row = (await decidedAs(approverAId)).find((r) => r.id === parId);
    expect(row?.my_decision).toBe("submit_signature");
    expect(row?.my_decided_at).toBeTruthy();
    // Semnătura de depunere nu e o decizie luată: cererea rămâne în inboxul aprobatorului real.
    expect((await pendingAs(approverBId)).map((r) => r.id)).toContain(parId);
  });

  it("[normal] decizia apăsată de om are prioritate față de semnătura de la depunere", async () => {
    const parId = await seedPar("PAR-2026-DEC7", approverAId);
    await testDb.insert(parApprovals).values({
      tenantId,
      parId,
      step: 0,
      approverUserId: approverAId,
      approverRoleLabel: "Requestor",
      decision: "approved",
      decidedAt: new Date("2026-07-02T09:00:00Z"),
      locked: false,
    });

    callerUserId = () => approverAId;
    expect((await post(`/api/par/${parId}/reject`, { comment: "Nu mai e nevoie" })).status).toBe(200);
    callerUserId = () => requestorId;

    expect((await decidedAs(approverAId)).find((r) => r.id === parId)?.my_decision).toBe("rejected");
  });

  it("[blocant] istoricul respectă scopul: fără acces la plătitor, cererea nu se mai vede", async () => {
    // Rol de tenant obișnuit + nicio calitate de membru pe plătitor → aria accesibilă e goală.
    // Istoricul nu are voie să fie o portiță către ce nu mai ai dreptul să vezi.
    expect(await decidedAs(approverAId, "user")).toHaveLength(0);
  });
});
