/**
 * @vitest-environment node
 * VM4-01 + VM4-02 — INTEGRATION (rute reale, PGlite, toate migrările).
 *
 * Feedback Violeta (finanțe), 2026-09-10:
 *   „din greșeală am apăsat plătit… cum să fac recall la acest PAR, să nu fie plata.
 *    Am vrut să apăs refuzat."
 *
 * Se testează ACȚIUNEA, nu afișarea (§3.5.1quater): endpoint-urile sunt chemate și se verifică
 * statusul cererii în DB, jurnalul de audit și rândul de plată.
 *
 * Acoperit:
 *   1. POST /:id/unpay pe o cerere plătită → 200, status `in_finance`, `paidAt` gol, rândul din
 *      par_payments PĂSTRAT (suma se re-folosește la re-plată), audit `payment_reverted`.
 *   2. După anulare, /pay funcționează din nou → cererea redevine `paid`.
 *   3. /unpay fără motiv → 400; pe o cerere care nu e plătită → 409; fără rol de finanțe → 403.
 *   4. POST /:id/finance-return din `in_finance` → 200, status `changes_requested` (editabil de
 *      solicitant), audit `finance_returned`.
 *   5. /finance-return pe o cerere plătită → 409 (întâi se anulează plata).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parRequests,
  parPayments,
  parAudit,
  parMembers,
  parPayerModules,
  parPayers,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let financeUserId: string;
let requestorId: string;
let parId: string;
let payerId: string;
/** Cine face cererea — comutat în testele de permisiuni. */
let callerId = "";
/** Rolul de workspace al apelantului. „manager"/„admin" implică par_admin (requirePARRole),
 *  deci solicitantul fără drepturi de finanțe trebuie să fie „teacher". */
let callerTenantRole = "manager";

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: callerId, tenantId, role: callerTenantRole, email: "finance@vector.md" });
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

/** Duce cererea în starea dorită înainte de fiecare scenariu. */
async function setStatus(status: "in_finance" | "paid", paidAt: Date | null) {
  await testDb
    .update(parRequests)
    .set({ status, paidAt })
    .where(eq(parRequests.id, parId));
}

async function auditEvents(): Promise<string[]> {
  const rows = await testDb
    .select({ event: parAudit.event })
    .from(parAudit)
    .where(and(eq(parAudit.parId, parId), eq(parAudit.tenantId, tenantId)));
  return rows.map((r) => r.event);
}

async function currentPar() {
  const [row] = await testDb.select().from(parRequests).where(eq(parRequests.id, parId));
  return row;
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parPaymentsRoutes } = await import("../routes/parPayments");
  app = new Hono();
  app.route("/api/par", parPaymentsRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC Test", slug: "atic-recall" }).returning();
  tenantId = tenant.id;

  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC Test" }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });

  const mkUser = async (email: string, name: string, role: "manager" | "teacher" = "manager") => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name, role })
      .returning();
    return u.id;
  };
  financeUserId = await mkUser("finance@vector.md", "Violeta Finanțe");
  requestorId = await mkUser("solicitant@vector.md", "Ana Solicitanta", "teacher");
  callerId = financeUserId;

  await testDb.insert(parMembers).values([
    { tenantId, userId: financeUserId, role: "finance" },
    { tenantId, userId: requestorId, role: "requestor" },
  ]);

  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: "PAR-2026-0020",
      requestedByUserId: requestorId,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "paid",
      payerId,
      endUse: "Executare plată EBRD",
      payeeName: "Consult Prim SRL",
      payeeIban: "MD24AG000225100013104168",
      currency: "MDL",
      totalEstimatedCents: 700000,
      dateOfRequest: new Date("2026-09-07T00:00:00Z"),
      paidAt: new Date("2026-09-07T12:00:00Z"),
    })
    .returning();
  parId = par.id;

  await testDb.insert(parPayments).values({
    tenantId,
    parId,
    actualAmountCents: 700000,
    paymentDate: new Date("2026-09-07T00:00:00Z"),
    paymentRef: "OP-2026-0047",
    receivedAt: new Date("2026-09-07T09:00:00Z"),
    receivedByUserId: financeUserId,
  });
  // 240s: sub paralelism, migrarea completă pe PGlite poate depăși 120s.
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("VM4-01 — anularea unei plăți marcate din greșeală", () => {
  it("[blocant] POST /:id/unpay pe o cerere plătită → 200, revine la in_finance, cu plata păstrată", async () => {
    callerId = financeUserId;
    await setStatus("paid", new Date("2026-09-07T12:00:00Z"));

    const res = await post(`/api/par/${parId}/unpay`, { reason: "am marcat din greșeală ca plătit" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("in_finance");

    const par = await currentPar();
    expect(par.status).toBe("in_finance");
    expect(par.paidAt).toBeNull();

    // Suma și referința rămân — finanțele reînregistrează plata corectată, nu de la zero.
    const [pmt] = await testDb.select().from(parPayments).where(eq(parPayments.parId, parId));
    expect(pmt.actualAmountCents).toBe(700000);
    expect(pmt.paymentRef).toBe("OP-2026-0047");

    expect(await auditEvents()).toContain("payment_reverted");
  });

  it("[blocant] după anulare, plata se poate reînregistra → cererea redevine paid", async () => {
    callerId = financeUserId;
    await setStatus("in_finance", null);

    const res = await post(`/api/par/${parId}/pay`, {
      actual_amount_cents: 700000,
      payment_date: "2026-09-08",
      payment_ref: "OP-2026-0051",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("paid");
    expect((await currentPar()).status).toBe("paid");
  });

  it("motivul e obligatoriu → 400", async () => {
    callerId = financeUserId;
    await setStatus("paid", new Date());
    expect((await post(`/api/par/${parId}/unpay`, { reason: "  " })).status).toBe(400);
    expect((await post(`/api/par/${parId}/unpay`, {})).status).toBe(400);
    expect((await currentPar()).status).toBe("paid");
  });

  it("pe o cerere care nu e plătită → 409", async () => {
    callerId = financeUserId;
    await setStatus("in_finance", null);
    const res = await post(`/api/par/${parId}/unpay`, { reason: "test" });
    expect(res.status).toBe(409);
  });

  it("fără rol de finanțe → 403 (solicitantul nu-și poate anula singur plata)", async () => {
    callerId = requestorId;
    callerTenantRole = "teacher";
    await setStatus("paid", new Date());
    const res = await post(`/api/par/${parId}/unpay`, { reason: "vreau înapoi" });
    expect(res.status).toBe(403);
    expect((await currentPar()).status).toBe("paid");
    callerId = financeUserId;
    callerTenantRole = "manager";
  });

  it("id nevalid în URL → 404, nu 500", async () => {
    callerId = financeUserId;
    const res = await post(`/api/par/nu-e-uuid/unpay`, { reason: "test" });
    expect(res.status).toBe(404);
  });
});

describe("VM4-02 — finanțele refuză plata și trimit cererea înapoi", () => {
  it("[blocant] POST /:id/finance-return din in_finance → 200, cererea devine changes_requested", async () => {
    callerId = financeUserId;
    await setStatus("in_finance", null);

    const res = await post(`/api/par/${parId}/finance-return`, {
      reason: "IBAN-ul nu corespunde cu contractul",
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("changes_requested");
    expect((await currentPar()).status).toBe("changes_requested");
    expect(await auditEvents()).toContain("finance_returned");
  });

  it("pe o cerere deja plătită → 409 (întâi se anulează plata)", async () => {
    callerId = financeUserId;
    await setStatus("paid", new Date());
    const res = await post(`/api/par/${parId}/finance-return`, { reason: "nu se plătește" });
    expect(res.status).toBe(409);
    expect((await currentPar()).status).toBe("paid");
  });

  it("fără rol de finanțe → 403", async () => {
    callerId = requestorId;
    callerTenantRole = "teacher";
    await setStatus("in_finance", null);
    const res = await post(`/api/par/${parId}/finance-return`, { reason: "nu vreau" });
    expect(res.status).toBe(403);
    callerId = financeUserId;
    callerTenantRole = "manager";
  });
});
