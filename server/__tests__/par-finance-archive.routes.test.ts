/**
 * @vitest-environment node
 * VM4-05 — arhiva cozii de finanțe. INTEGRATION (rute reale, PGlite, toate migrările).
 *
 * De ce există: o cerere refuzată de finanțe pe care solicitantul o abandonează rămâne în coadă la
 * nesfârșit — iar dacă e marcată „urgentă", stă chiar pe primul rând. Arhivarea o scoate din lista
 * de lucru fără să-i schimbe statusul și fără să șteargă nimic.
 *
 * Se testează ACȚIUNEA, nu afișarea (§3.5.1quater).
 *
 * Acoperit:
 *   1. POST /:id/finance-archive → 200; cererea dispare din GET /finance, apare în
 *      GET /finance?archived=1; statusul NU se schimbă; audit `finance_archived`.
 *   2. Contoarele `activeCount` / `archivedCount` vin pe ambele taburi.
 *   3. POST /:id/finance-unarchive → cererea revine în lista de lucru; audit `finance_unarchived`.
 *   4. REGRESIE: o cerere arhivată care se MIȘCĂ (corectată → aprobată din nou) revine SINGURĂ în
 *      lista de lucru. Altfel o plată reală ar rămâne ascunsă într-o arhivă pe care n-o deschide nimeni.
 *   5. Nota e opțională (corp gol → 200), dar se păstrează în jurnal când e dată.
 *   6. Fără rol de finanțe → 403; pe o cerere din afara cozii (plătită) → 409.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parAudit, parMembers, parPayerModules, parPayers } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let financeUserId: string;
let requestorId: string;
let parId: string;
let payerId: string;
let callerId = "";
/** „manager"/„admin" implică par_admin, deci solicitantul fără drepturi de finanțe e „teacher". */
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

interface QueueBody {
  items: { id: string; status: string; financeArchive?: { byName: string | null; note: string | null } | null }[];
  total: number;
  activeCount?: number;
  archivedCount?: number;
  archived?: boolean;
}

const post = (p: string, body?: unknown) =>
  app.request(p, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

async function queue(archived = false): Promise<QueueBody> {
  const res = await app.request(`/api/par/finance${archived ? "?archived=1" : ""}`);
  expect(res.status).toBe(200);
  return (await res.json()) as QueueBody;
}

async function auditEvents(): Promise<string[]> {
  const rows = await testDb
    .select({ event: parAudit.event })
    .from(parAudit)
    .where(and(eq(parAudit.parId, parId), eq(parAudit.tenantId, tenantId)));
  return rows.map((r) => r.event);
}

/** Readuce cererea în starea „refuzată de finanțe", punctul de plecare al fiecărui scenariu. */
async function resetToFinanceReturned() {
  await testDb.delete(parAudit).where(eq(parAudit.parId, parId));
  await testDb.update(parRequests).set({ status: "in_finance" }).where(eq(parRequests.id, parId));
  callerId = financeUserId;
  callerTenantRole = "manager";
  const res = await post(`/api/par/${parId}/finance-return`, { reason: "nu există așa companie" });
  expect(res.status).toBe(200);
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parPaymentsRoutes } = await import("../routes/parPayments");
  app = new Hono();
  app.route("/api/par", parPaymentsRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC Test", slug: "atic-archive" }).returning();
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
  financeUserId = await mkUser("finance@vector.md", "Violeta Bordeniuc");
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
      status: "in_finance",
      payerId,
      endUse: "Executare plată EBRD",
      payeeName: "WILDBERRIES GROUP SRL",
      payeeIban: "MD06ML000000002251468",
      currency: "MDL",
      totalEstimatedCents: 700000,
      isUrgent: true,
      dateOfRequest: new Date("2026-09-07T00:00:00Z"),
    })
    .returning();
  parId = par.id;
  // 240s: sub paralelism, migrarea completă pe PGlite poate depăși 120s.
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("VM4-05 — arhivarea unei cereri din coada de finanțe", () => {
  it("[blocant] arhivarea scoate cererea din lista de lucru și o mută în arhivă, fără să-i schimbe statusul", async () => {
    await resetToFinanceReturned();

    const before = await queue();
    expect(before.items.map((i) => i.id)).toContain(parId);

    const res = await post(`/api/par/${parId}/finance-archive`, { note: "solicitantul a renunțat" });
    expect(res.status).toBe(200);

    const active = await queue();
    expect(active.items.map((i) => i.id)).not.toContain(parId);

    const archived = await queue(true);
    expect(archived.items.map((i) => i.id)).toContain(parId);
    expect(archived.archived).toBe(true);

    // Statusul rămâne intact: o cerere refuzată e tot refuzată, doar că nu mai stă în ochii nimănui.
    const [row] = await testDb.select().from(parRequests).where(eq(parRequests.id, parId));
    expect(row.status).toBe("changes_requested");

    expect(await auditEvents()).toContain("finance_archived");
  });

  it("[blocant] arhiva spune cine a arhivat și cu ce notă", async () => {
    await resetToFinanceReturned();
    expect((await post(`/api/par/${parId}/finance-archive`, { note: "solicitantul a renunțat" })).status).toBe(200);

    const archived = await queue(true);
    const item = archived.items.find((i) => i.id === parId);
    expect(item?.financeArchive?.byName).toBe("Violeta Bordeniuc");
    expect(item?.financeArchive?.note).toBe("solicitantul a renunțat");
  });

  it("[blocant] contoarele celor două liste vin pe ambele taburi", async () => {
    await resetToFinanceReturned();
    expect((await post(`/api/par/${parId}/finance-archive`, { note: null })).status).toBe(200);

    const active = await queue();
    expect(active.activeCount).toBe(0);
    expect(active.archivedCount).toBe(1);

    const archived = await queue(true);
    expect(archived.activeCount).toBe(0);
    expect(archived.archivedCount).toBe(1);
  });

  it("[blocant] restaurarea readuce cererea în lista de lucru", async () => {
    await resetToFinanceReturned();
    expect((await post(`/api/par/${parId}/finance-archive`, { note: null })).status).toBe(200);

    const res = await post(`/api/par/${parId}/finance-unarchive`, { note: "a revenit cu actele" });
    expect(res.status).toBe(200);

    const active = await queue();
    expect(active.items.map((i) => i.id)).toContain(parId);
    expect((await queue(true)).items.map((i) => i.id)).not.toContain(parId);
    expect(await auditEvents()).toContain("finance_unarchived");
  });

  it("[blocant] o cerere arhivată care se mișcă revine SINGURĂ în lista de lucru", async () => {
    await resetToFinanceReturned();
    expect((await post(`/api/par/${parId}/finance-archive`, { note: null })).status).toBe(200);
    expect((await queue()).items.map((i) => i.id)).not.toContain(parId);

    // Solicitantul a corectat cererea, ea a trecut din nou prin aprobări și așteaptă plata.
    await testDb.update(parRequests).set({ status: "approved" }).where(eq(parRequests.id, parId));

    const active = await queue();
    expect(active.items.map((i) => i.id)).toContain(parId);
    expect((await queue(true)).items.map((i) => i.id)).not.toContain(parId);
  });

  it("nota e opțională — un corp gol arhivează la fel", async () => {
    await resetToFinanceReturned();
    const res = await app.request(`/api/par/${parId}/finance-archive`, { method: "POST" });
    expect(res.status).toBe(200);

    const item = (await queue(true)).items.find((i) => i.id === parId);
    expect(item?.financeArchive?.note).toBeNull();
  });

  it("fără rol de finanțe → 403", async () => {
    await resetToFinanceReturned();
    callerId = requestorId;
    callerTenantRole = "teacher";
    const res = await post(`/api/par/${parId}/finance-archive`, { note: null });
    expect(res.status).toBe(403);
    callerId = financeUserId;
    callerTenantRole = "manager";
  });

  it("o cerere care nu e în coada de finanțe (deja plătită) → 409", async () => {
    await resetToFinanceReturned();
    await testDb.update(parRequests).set({ status: "paid" }).where(eq(parRequests.id, parId));

    const res = await post(`/api/par/${parId}/finance-archive`, { note: null });
    expect(res.status).toBe(409);
  });
});
