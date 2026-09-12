/**
 * @vitest-environment node
 * VM5-20 — bugetul evenimentului pe rutele reale (PGlite, toate migrările).
 *
 * Cerința: „la evenimente la fel să poată fi linii de buget, să încarci și după să vezi dacă te
 * încadrezi, și să scoți raport per eveniment cu cheltuieli planned vs realizat."
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
  parEvents,
  parProjects,
  parBudgetCodes,
  parMembers,
  parPayers,
  parPayerModules,
  parPayerMembers,
  parPayments,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let session: { id: string; tenantId: string; role: string; email: string };

vi.mock("../db/client", () => ({
  get db() { return testDb; },
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
let eventId: string;
let financeUser: string;
let plainUser: string;
let codeCatering: string;
let codeTransport: string;
const L = (lei: number) => lei * 100;

async function applyMigrations(pg: PGlite) {
  const dir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const e of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(dir, `${e.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

interface BudgetReport {
  lines: Array<{
    label: string; allocatedMdlCents: number; committedMdlCents: number; paidMdlCents: number;
    availableMdlCents: number | null; over: boolean; unplanned: boolean;
  }>;
  plannedMdlCents: number; committedMdlCents: number; paidMdlCents: number;
  availableMdlCents: number; hasPlan: boolean; overTotal: boolean;
}

const getBudget = async (): Promise<BudgetReport> =>
  (await app.request(`/api/par/events/${eventId}/budget`)).json() as Promise<BudgetReport>;

const putBudget = (lines: unknown[]) =>
  app.request(`/api/par/events/${eventId}/budget`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lines }),
  });

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parEventsRoutes } = await import("../routes/parEvents");
  app = new Hono();
  app.route("/api/par/events", parEventsRoutes);

  const [t] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-evbudget" }).returning();
  tenantId = t.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC SRL" }).returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });

  const mkUser = async (email: string, name: string) => {
    const [u] = await testDb.insert(users).values({ tenantId, email, passwordHash: "x", name, role: "teacher" }).returning();
    return u.id;
  };
  financeUser = await mkUser("finante@atic.md", "Violeta");
  plainUser = await mkUser("solicitant@atic.md", "Iulian");
  await testDb.insert(parMembers).values({ tenantId, userId: financeUser, role: "finance" });
  await testDb.insert(parMembers).values({ tenantId, userId: plainUser, role: "requestor" });
  // Aria: fără apartenența la plătitor (din care se moștenesc proiectele), ruta răspunde „not_found"
  // înainte de orice regulă de buget.
  for (const userId of [financeUser, plainUser]) {
    await testDb.insert(parPayerMembers).values({ tenantId, payerId: payer.id, userId });
  }

  const [proj] = await testDb.insert(parProjects).values({ tenantId, name: "Tekwill", payerId: payer.id, active: true }).returning();
  const [evt] = await testDb.insert(parEvents).values({ tenantId, projectId: proj.id, name: "Conferința anuală", active: true }).returning();
  eventId = evt.id;

  const [c1] = await testDb.insert(parBudgetCodes).values({ tenantId, code: "6.1", name: "Catering", payerId: payer.id }).returning();
  const [c2] = await testDb.insert(parBudgetCodes).values({ tenantId, code: "6.2", name: "Transport", payerId: payer.id }).returning();
  codeCatering = c1.id;
  codeTransport = c2.id;

  // Cheltuieli reale pe eveniment: 30.000 angajați pe catering, 12.000 plătiți pe transport.
  await testDb.insert(parRequests).values({
    tenantId, payerId: payer.id, requestNo: "PAR-2026-0301", requestedByUserId: plainUser,
    status: "approved", currency: "MDL", totalEstimatedCents: L(30000), totalMdlCents: L(30000),
    eventId, budgetCodeId: codeCatering,
  });
  const [platita] = await testDb.insert(parRequests).values({
    tenantId, payerId: payer.id, requestNo: "PAR-2026-0302", requestedByUserId: plainUser,
    status: "paid", currency: "MDL", totalEstimatedCents: L(12000), totalMdlCents: L(12000),
    eventId, budgetCodeId: codeTransport,
  }).returning();
  await testDb.insert(parPayments).values({ tenantId, parId: platita.id, actualAmountCents: L(12000) });

  session = { id: financeUser, tenantId, role: "teacher", email: "finante@atic.md" };
});

describe("PUT /api/par/events/:id/budget", () => {
  it("încarcă liniile dintr-o dată (ce trimite lipirea din Excel)", async () => {
    const res = await putBudget([
      { budget_code_id: codeCatering, allocated_cents: L(40000), currency: "MDL" },
      { budget_code_id: codeTransport, allocated_cents: L(10000), currency: "MDL" },
      { budget_code_id: null, label: "Rezervă", allocated_cents: L(5000), currency: "MDL" },
    ]);
    expect(res.status).toBe(200);

    const r = await getBudget();
    expect(r.plannedMdlCents).toBe(L(55000));
    expect(r.hasPlan).toBe(true);
  });

  it("o a doua încărcare ÎNLOCUIEȘTE planul, nu-l dublează", async () => {
    await putBudget([{ budget_code_id: codeCatering, allocated_cents: L(40000), currency: "MDL" }]);
    const r = await getBudget();
    expect(r.plannedMdlCents).toBe(L(40000));
    expect(r.lines.filter((l) => !l.unplanned)).toHaveLength(1);
  });

  it("refuză un cod bugetar inexistent, ca să nu rămână o linie care nu se confruntă cu nimic", async () => {
    const res = await putBudget([
      { budget_code_id: "00000000-0000-0000-0000-000000000000", allocated_cents: L(100) },
    ]);
    expect(res.status).toBe(400);
  });

  it("un solicitant nu poate rescrie bugetul evenimentului", async () => {
    session = { id: plainUser, tenantId, role: "teacher", email: "solicitant@atic.md" };
    const res = await putBudget([{ budget_code_id: codeCatering, allocated_cents: L(1) }]);
    expect(res.status).toBe(403);
    session = { id: financeUser, tenantId, role: "teacher", email: "finante@atic.md" };
  });
});

describe("GET /api/par/events/:id/budget — planificat vs realizat", () => {
  beforeAll(async () => {
    await putBudget([
      { budget_code_id: codeCatering, allocated_cents: L(40000), currency: "MDL" },
      { budget_code_id: codeTransport, allocated_cents: L(10000), currency: "MDL" },
    ]);
  });

  it("pune pe fiecare linie cât s-a angajat și cât s-a plătit", async () => {
    const r = await getBudget();
    const catering = r.lines.find((l) => l.label.includes("Catering"))!;
    expect(catering.allocatedMdlCents).toBe(L(40000));
    expect(catering.committedMdlCents).toBe(L(30000));
    expect(catering.availableMdlCents).toBe(L(10000));
    expect(catering.over).toBe(false);
  });

  it("arată linia depășită", async () => {
    const r = await getBudget();
    const transport = r.lines.find((l) => l.label.includes("Transport"))!;
    expect(transport.paidMdlCents).toBe(L(12000));
    expect(transport.availableMdlCents).toBe(-L(2000));
    expect(transport.over).toBe(true);
  });

  it("răspunde la întrebarea din ședință: s-a depășit TOTALUL evenimentului?", async () => {
    const r = await getBudget();
    expect(r.plannedMdlCents).toBe(L(50000));
    expect(r.committedMdlCents + r.paidMdlCents).toBe(L(42000));
    expect(r.overTotal).toBe(false);
    expect(r.availableMdlCents).toBe(L(8000));
  });

  it("o cheltuială pe un cod care nu e în plan apare ca «neplanificat»", async () => {
    const [c3] = await testDb.insert(parBudgetCodes).values({ tenantId, code: "9.9", name: "Neprevăzute" }).returning();
    await testDb.insert(parRequests).values({
      tenantId, requestNo: "PAR-2026-0303", requestedByUserId: plainUser, status: "approved",
      currency: "MDL", totalEstimatedCents: L(3000), totalMdlCents: L(3000), eventId, budgetCodeId: c3.id,
    });
    const r = await getBudget();
    const extra = r.lines.find((l) => l.unplanned);
    expect(extra).toBeDefined();
    expect(extra!.committedMdlCents).toBe(L(3000));
    expect(extra!.allocatedMdlCents).toBe(0);
  });

  it("un eveniment din alt workspace nu se vede", async () => {
    const [alt] = await testDb.insert(tenants).values({ name: "Alt", slug: "alt-evbudget" }).returning();
    const [altEvt] = await testDb.insert(parEvents).values({ tenantId: alt.id, name: "Eveniment străin", active: true }).returning();
    const res = await app.request(`/api/par/events/${altEvt.id}/budget`);
    expect(res.status).toBe(404);
  });
});
