/**
 * @vitest-environment node
 *
 * CRM — Taskuri pe lead, „de azi”, motive de pierdere și etichete, pe o bază PGlite reală
 * (migrările chiar rulate, nu un mock peste tabele).
 *
 * Harness copiat din `server/__tests__/crm.routes.test.ts` (PGlite + replay `_journal.json` +
 * `vi.mock` cu getter pe `../db/client` + `vi.mock` pe `requireAuth`) — vezi comentariile de acolo
 * pentru raționamentul complet.
 *
 * tenantA/tenantB sunt tenanți PARTAJAȚI de majoritatea testelor (curățați de `beforeEach`, care
 * șterge `leads` — cascadă, șterge automat `crm_lead_tasks`/`lead_tags`/`lead_interactions`).
 * Testele care ating `crm_pipeline_stages` sau `crm_lost_reasons` (netouched de `beforeEach`)
 * își fac propriul tenant cu `createFreshTenant()`, ca să nu depindă de ordinea celorlalte teste.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads, leadInteractions } from "../db/schema/leads";
import { crmPipelineStages, type NewCrmPipelineStage } from "../db/schema/crmPipelineStages";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

type CurrentUser = { id: string; tenantId: string; role: string; email: string };
let currentUser: CurrentUser;

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", currentUser);
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

let tenantA: string;
let userA: string;
/** Un al doilea agent, ÎN ACELAȘI tenant A — pentru testul de filtrare pe `owner`. */
let userA2: string;
let tenantB: string;
let userB: string;

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmLeadsRoutes } = await import("../routes/crmLeads");
  const { crmTasksRoutes } = await import("../routes/crmTasks");
  const { crmLostReasonsRoutes } = await import("../routes/crmLostReasons");
  const { crmTagsRoutes } = await import("../routes/crmTags");
  app = new Hono();
  app.route("/api/crm/leads", crmLeadsRoutes);
  app.route("/api/crm/tasks", crmTasksRoutes);
  app.route("/api/crm/lost-reasons", crmLostReasonsRoutes);
  app.route("/api/crm/tags", crmTagsRoutes);

  const [tA] = await testDb
    .insert(tenants)
    .values({ name: "CRM Tasks Test A", slug: "crm-tasks-test-a" })
    .returning();
  tenantA = tA.id;
  const [uA] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "andreea@tasks-a.md", passwordHash: "x", name: "Andreea", role: "admin" })
    .returning();
  userA = uA.id;
  const [uA2] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "victor@tasks-a.md", passwordHash: "x", name: "Victor", role: "manager" })
    .returning();
  userA2 = uA2.id;

  const [tB] = await testDb
    .insert(tenants)
    .values({ name: "CRM Tasks Test B", slug: "crm-tasks-test-b" })
    .returning();
  tenantB = tB.id;
  const [uB] = await testDb
    .insert(users)
    .values({ tenantId: tenantB, email: "bogdan@tasks-b.md", passwordHash: "x", name: "Bogdan", role: "admin" })
    .returning();
  userB = uB.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  // Cascadă: ștergerea lead-urilor șterge automat crm_lead_tasks, lead_tags, lead_interactions.
  await testDb.delete(leads);
  currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "andreea@tasks-a.md" };
});

/** Creează un lead ca tenantul/userul curent și întoarce rândul creat. */
async function createLead(overrides: Record<string, unknown> = {}) {
  const res = await app.request("/api/crm/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fullName: "Ion Vasilescu", ...overrides }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

/** Creează un task pe un lead, ca tenantul/userul curent, și întoarce rândul creat. */
async function createTask(leadId: string, overrides: Record<string, unknown> = {}) {
  const res = await app.request("/api/crm/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ leadId, title: "Sună clientul", ...overrides }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

// ─── Helpere pentru teste care au nevoie de un tenant curat (stages/lost-reasons) ─

let freshTenantSeq = 0;

async function createFreshTenant(): Promise<{ tenantId: string; userId: string; email: string }> {
  freshTenantSeq += 1;
  const n = freshTenantSeq;
  const [t] = await testDb
    .insert(tenants)
    .values({ name: `CRM Tasks Fresh ${n}`, slug: `crm-tasks-fresh-${n}` })
    .returning();
  const email = `tasks-fresh-${n}@test.md`;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId: t.id, email, passwordHash: "x", name: `Tester ${n}`, role: "admin" })
    .returning();
  return { tenantId: t.id, userId: u.id, email };
}

function loginAs(tenant: { tenantId: string; userId: string; email: string }) {
  currentUser = { id: tenant.userId, tenantId: tenant.tenantId, role: "admin", email: tenant.email };
}

/** Inserează direct etapele de pipeline ale unui tenant (control total pe chei/flaguri, fără să
 *  treacă prin `crmStagesRoutes` — fișier care nu e mounted în acest harness). */
async function setStages(tenantId: string, rows: Array<Partial<NewCrmPipelineStage> & { key: string }>) {
  const values: NewCrmPipelineStage[] = rows.map((r, i) => ({
    tenantId,
    label: r.key,
    orderIndex: i,
    isWon: false,
    isLost: false,
    ...r,
  }));
  await testDb.insert(crmPipelineStages).values(values);
}

// ─── Izolare multi-tenant — taskuri ────────────────────────────────────────────

describe("Izolare multi-tenant — taskuri", () => {
  it("[blocant] taskurile unui workspace nu sunt vizibile din altul", async () => {
    const lead = await createLead({ fullName: "Client Tenant A" });
    const task = await createTask(lead.id, { title: "Revino cu oferta" });

    // Comutăm sesiunea pe tenantul B.
    currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bogdan@tasks-b.md" };

    const byLead = await app.request(`/api/crm/tasks?leadId=${lead.id}`);
    expect(byLead.status).toBe(404); // lead-ul însuși nu e în tenantul B

    const patchRes = await app.request(`/api/crm/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Am furat taskul" }),
    });
    expect(patchRes.status).toBe(404);

    const completeRes = await app.request(`/api/crm/tasks/${task.id}/complete`, { method: "POST" });
    expect(completeRes.status).toBe(404);

    const reopenRes = await app.request(`/api/crm/tasks/${task.id}/reopen`, { method: "POST" });
    expect(reopenRes.status).toBe(404);

    const snoozeRes = await app.request(`/api/crm/tasks/${task.id}/snooze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days: 3 }),
    });
    expect(snoozeRes.status).toBe(404);

    const deleteRes = await app.request(`/api/crm/tasks/${task.id}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(404);

    // Nici lista „upcoming” a tenantului B nu-l arată.
    const upcoming = await (await app.request("/api/crm/tasks?scope=upcoming")).json();
    expect(upcoming.items).toHaveLength(0);

    // Taskul original, văzut de tenantul A, e neatins.
    currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "andreea@tasks-a.md" };
    const original = await (await app.request(`/api/crm/tasks?leadId=${lead.id}`)).json();
    expect(original.items).toHaveLength(1);
    expect(original.items[0].title).toBe("Revino cu oferta");
  });
});

// ─── POST /api/crm/tasks ───────────────────────────────────────────────────────

describe("POST /api/crm/tasks", () => {
  it("creează un task cu status implicit „open” pe un lead al tenantului", async () => {
    const lead = await createLead();
    const task = await createTask(lead.id, { title: "Trimite oferta", dueAt: "2026-07-01T10:00:00.000Z" });

    expect(task.status).toBe("open");
    expect(task.leadId).toBe(lead.id);
    expect(task.title).toBe("Trimite oferta");
    expect(task.dueAt).toBe("2026-07-01T10:00:00.000Z");
    expect(task.completedAt).toBeNull();
    expect(task.createdBy).toBe(userA);
  });

  it("respinge crearea unui task pe un lead dintr-un alt tenant, cu 404", async () => {
    const leadB = await (async () => {
      currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bogdan@tasks-b.md" };
      const l = await createLead({ fullName: "Client Tenant B" });
      currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "andreea@tasks-a.md" };
      return l;
    })();

    const res = await app.request("/api/crm/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId: leadB.id, title: "Nu ar trebui să meargă" }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("not_found");
  });

  it("respinge un titlu gol cu 400 de validare", async () => {
    const lead = await createLead();
    const res = await app.request("/api/crm/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, title: "" }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/crm/tasks?leadId= ────────────────────────────────────────────────

describe("GET /api/crm/tasks?leadId=", () => {
  it("listează taskurile unui lead, cele fără scadență la urmă", async () => {
    const lead = await createLead();
    await createTask(lead.id, { title: "Fără scadență" });
    await createTask(lead.id, { title: "Scadent mai devreme", dueAt: "2026-03-01T00:00:00.000Z" });
    await createTask(lead.id, { title: "Scadent mai târziu", dueAt: "2026-05-01T00:00:00.000Z" });

    const { items } = await (await app.request(`/api/crm/tasks?leadId=${lead.id}`)).json();
    expect(items.map((t: { title: string }) => t.title)).toEqual([
      "Scadent mai devreme",
      "Scadent mai târziu",
      "Fără scadență",
    ]);
  });

  it("fără `leadId` sau `scope`, răspunde 400", async () => {
    const res = await app.request("/api/crm/tasks");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("leadId_or_scope_required");
  });
});

// ─── GET /api/crm/tasks?scope=upcoming ─────────────────────────────────────────

describe("GET /api/crm/tasks?scope=upcoming", () => {
  it("aduce doar taskurile deschise, cu scadență, cu numele lead-ului alăturat", async () => {
    const lead = await createLead({ fullName: "Maria Popescu", dealName: "Pachet Premium" });
    const withDue = await createTask(lead.id, { title: "Sună", dueAt: "2026-04-01T00:00:00.000Z" });
    await createTask(lead.id, { title: "Fără scadență, nu apare aici" });
    const done = await createTask(lead.id, { title: "Deja rezolvat", dueAt: "2026-04-02T00:00:00.000Z" });
    await app.request(`/api/crm/tasks/${done.id}/complete`, { method: "POST" });

    const { items } = await (await app.request("/api/crm/tasks?scope=upcoming")).json();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(withDue.id);
    expect(items[0].leadFullName).toBe("Maria Popescu");
    expect(items[0].leadDealName).toBe("Pachet Premium");
  });
});

// ─── PATCH /api/crm/tasks/:id ──────────────────────────────────────────────────

describe("PATCH /api/crm/tasks/:id", () => {
  it("actualizează titlul, scadența și responsabilul", async () => {
    const lead = await createLead();
    const task = await createTask(lead.id, { title: "Titlu vechi" });

    const res = await app.request(`/api/crm/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Titlu nou", dueAt: "2026-08-01T00:00:00.000Z", assignedTo: userA }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.title).toBe("Titlu nou");
    expect(updated.dueAt).toBe("2026-08-01T00:00:00.000Z");
    expect(updated.assignedTo).toBe(userA);
  });

  it("un id inexistent (sau din alt tenant) răspunde 404", async () => {
    const res = await app.request(`/api/crm/tasks/00000000-0000-0000-0000-000000000000`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Oricum" }),
    });
    expect(res.status).toBe(404);
  });
});

// ─── POST /api/crm/tasks/:id/complete și /reopen ───────────────────────────────

describe("POST /api/crm/tasks/:id/complete și /reopen", () => {
  it("un task încheiat iese din restanțe și primește completedAt", async () => {
    const lead = await createLead({ fullName: "Client cu restanță" });
    const overdue = await createTask(lead.id, { title: "Restant", dueAt: "2020-01-01T00:00:00.000Z" });

    const before = await (await app.request("/api/crm/tasks/today")).json();
    expect(before.overdueTasks.some((o: { task: { id: string } }) => o.task.id === overdue.id)).toBe(true);

    const res = await app.request(`/api/crm/tasks/${overdue.id}/complete`, { method: "POST" });
    expect(res.status).toBe(200);
    const completed = await res.json();
    expect(completed.status).toBe("done");
    expect(completed.completedAt).not.toBeNull();

    const after = await (await app.request("/api/crm/tasks/today")).json();
    expect(after.overdueTasks.some((o: { task: { id: string } }) => o.task.id === overdue.id)).toBe(false);
  });

  it("redeschiderea golește completedAt și taskul redevine „open”", async () => {
    const lead = await createLead();
    const task = await createTask(lead.id);
    await app.request(`/api/crm/tasks/${task.id}/complete`, { method: "POST" });

    const res = await app.request(`/api/crm/tasks/${task.id}/reopen`, { method: "POST" });
    expect(res.status).toBe(200);
    const reopened = await res.json();
    expect(reopened.status).toBe("open");
    expect(reopened.completedAt).toBeNull();
  });
});

// ─── POST /api/crm/tasks/:id/snooze ────────────────────────────────────────────

describe("POST /api/crm/tasks/:id/snooze", () => {
  it("amânarea împinge scadența înainte cu N zile, nu o șterge", async () => {
    const lead = await createLead();
    const task = await createTask(lead.id, { title: "De amânat", dueAt: "2026-01-10T00:00:00.000Z" });

    const res = await app.request(`/api/crm/tasks/${task.id}/snooze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days: 5 }),
    });
    expect(res.status).toBe(200);
    const snoozed = await res.json();
    expect(snoozed.dueAt).not.toBeNull();
    expect(new Date(snoozed.dueAt).toISOString()).toBe("2026-01-15T00:00:00.000Z");
    // Rămâne „open”: un status „snoozed” scotea taskul definitiv din clopoțel, din „azi” și din
    // „fără pas următor” (toate citesc taskurile deschise). Amânarea mută doar scadența.
    expect(snoozed.status).toBe("open");
  });

  it("amânarea unui task fără scadență pornește de la „acum”, nu de la null", async () => {
    const lead = await createLead();
    const task = await createTask(lead.id, { title: "Fără scadență încă" });
    expect(task.dueAt).toBeNull();

    const before = Date.now();
    const res = await app.request(`/api/crm/tasks/${task.id}/snooze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ days: 2 }),
    });
    const snoozed = await res.json();
    expect(snoozed.dueAt).not.toBeNull();
    const dueMs = new Date(snoozed.dueAt).getTime();
    // Cel puțin ~2 zile după momentul cererii (marjă largă, ca testul să nu fie fragil pe CI lent).
    expect(dueMs).toBeGreaterThan(before + 1.9 * 86_400_000);
  });
});

// ─── DELETE /api/crm/tasks/:id ─────────────────────────────────────────────────

describe("DELETE /api/crm/tasks/:id", () => {
  it("șterge taskul definitiv", async () => {
    const lead = await createLead();
    const task = await createTask(lead.id);

    const res = await app.request(`/api/crm/tasks/${task.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);

    const { items } = await (await app.request(`/api/crm/tasks?leadId=${lead.id}`)).json();
    expect(items).toHaveLength(0);
  });
});

// ─── GET /api/crm/tasks/today ──────────────────────────────────────────────────

describe("GET /api/crm/tasks/today", () => {
  it("[blocant] lista „de azi” a unui agent conține doar munca lui, nu a toată firma", async () => {
    const mine = await createLead({ fullName: "Lead-ul meu (Andreea)", assignedTo: userA });
    const other = await createLead({ fullName: "Lead-ul colegului (Victor)", assignedTo: userA2 });

    // Fără `owner`, lista arată munca ÎNTREGII echipe (comportament neschimbat) — ambele lead-uri,
    // fiindcă niciunul n-are vreun task deschis.
    const all = await (await app.request("/api/crm/tasks/today")).json();
    expect(all.noNextStep.map((l: { id: string }) => l.id).sort()).toEqual([mine.id, other.id].sort());

    // Cu `?owner=<userA>`, lista arată DOAR lead-ul Andreei — nu și pe-al lui Victor. Bug-ul din
    // sursă (crm-vector) era exact opusul: fiecare agent vedea munca întregii firme.
    const onlyMine = await (await app.request(`/api/crm/tasks/today?owner=${userA}`)).json();
    expect(onlyMine.noNextStep.map((l: { id: string }) => l.id)).toEqual([mine.id]);

    const onlyColleague = await (await app.request(`/api/crm/tasks/today?owner=${userA2}`)).json();
    expect(onlyColleague.noNextStep.map((l: { id: string }) => l.id)).toEqual([other.id]);
  });

  it("[blocant] „de azi” nu hardcodează etapele câștigat/pierdut — merge și cu etape redenumite", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    // Chei DELIBERAT diferite de „paid"/„lost" — ca să dovedim că excluderea din gălețile active
    // se face după flagurile isWon/isLost, nu după o cheie fixă (un pipeline importat din Kommo,
    // de exemplu, folosește „won"/„closed_lost", nu „paid"/„lost").
    await setStages(fresh.tenantId, [
      { key: "nou", isWon: false, isLost: false },
      { key: "castigat", isWon: true, isLost: false },
      { key: "arhivat_pierdut", isWon: false, isLost: true },
    ]);

    const won = await createLead({ fullName: "Client câștigat", stage: "castigat" });
    const lost = await createLead({ fullName: "Lead arhivat/pierdut", stage: "arhivat_pierdut" });
    const active = await createLead({ fullName: "Lead activ, necontactat", stage: "nou" });

    const body = await (await app.request("/api/crm/tasks/today")).json();

    const allActiveIds = [...body.uncontacted, ...body.noNextStep, ...body.neglected].map(
      (l: { id: string }) => l.id
    );
    expect(allActiveIds).not.toContain(won.id);
    expect(allActiveIds).not.toContain(lost.id);
    expect(body.noNextStep.map((l: { id: string }) => l.id)).toContain(active.id);
  });

  it("cele patru gălețile: restante, necontactate, fără pas următor, neglijate", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);
    await setStages(fresh.tenantId, [
      { key: "new", isWon: false, isLost: false },
      { key: "contacted", isWon: false, isLost: false },
    ]);

    // L1 — are un task deschis, restant → doar în `overdueTasks`.
    const l1 = await createLead({ fullName: "Are restanță", stage: "contacted" });
    const overdueTask = await createTask(l1.id, { title: "Revino", dueAt: "2020-01-01T00:00:00.000Z" });
    await app.request(`/api/crm/leads/${l1.id}/interactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "call", direction: "outbound" }),
    });

    // L2 — lead nou, fără nicio interacțiune și fără niciun task → `uncontacted` ȘI `noNextStep`.
    const l2 = await createLead({ fullName: "Lead nou necontactat", stage: "new" });

    // L3 — activ, dar neatins de mult (createdAt împins manual în trecut) → doar `neglected`
    // (are un task deschis cu scadență VIITOARE, ca să nu apară nici în overdue, nici în noNextStep).
    const l3 = await createLead({ fullName: "Lead neglijat", stage: "contacted" });
    await createTask(l3.id, { title: "Programat", dueAt: "2030-01-01T00:00:00.000Z" });
    await testDb.update(leads).set({ createdAt: new Date(Date.now() - 10 * 86_400_000) }).where(eq(leads.id, l3.id));

    // L4 — activ, sănătos: task deschis cu scadență viitoare + interacțiune recentă → în NICIO gălețică.
    const l4 = await createLead({ fullName: "Lead sănătos", stage: "contacted" });
    await createTask(l4.id, { title: "Programat", dueAt: "2030-01-01T00:00:00.000Z" });
    await app.request(`/api/crm/leads/${l4.id}/interactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "note", body: "Totul e pe drum" }),
    });

    const body = await (await app.request("/api/crm/tasks/today")).json();

    expect(body.overdueTasks.map((o: { task: { id: string } }) => o.task.id)).toEqual([overdueTask.id]);
    expect(body.uncontacted.map((l: { id: string }) => l.id)).toEqual([l2.id]);
    expect(body.noNextStep.map((l: { id: string }) => l.id)).toEqual([l2.id]);
    expect(body.neglected.map((l: { id: string }) => l.id)).toEqual([l3.id]);

    // Negativ, explicit: lead-ul „sănătos" nu apare în nicio gălețică.
    const everywhereElse = [
      ...body.overdueTasks.map((o: { lead: { id: string } }) => o.lead.id),
      ...body.uncontacted.map((l: { id: string }) => l.id),
      ...body.noNextStep.map((l: { id: string }) => l.id),
      ...body.neglected.map((l: { id: string }) => l.id),
    ];
    expect(everywhereElse).not.toContain(l4.id);
  });
});

// ─── GET /api/crm/lost-reasons ──────────────────────────────────────────────────

describe("GET /api/crm/lost-reasons", () => {
  it("primul GET seamănă cele 6 motive implicite, în română, idempotent", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    const res = await app.request("/api/crm/lost-reasons");
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.map((r: { label: string }) => r.label)).toEqual([
      "Preț prea mare",
      "A ales alt furnizor",
      "Nu mai are nevoie",
      "Nu răspunde",
      "Buget amânat",
      "Altul",
    ]);
    expect(items.every((r: { tenantId: string }) => r.tenantId === fresh.tenantId)).toBe(true);

    // Idempotent: a doua citire nu dublează motivele.
    const again = await (await app.request("/api/crm/lost-reasons")).json();
    expect(again.items).toHaveLength(6);
  });
});

// ─── POST/PATCH/DELETE/reorder /api/crm/lost-reasons ───────────────────────────

describe("POST/PATCH/DELETE /api/crm/lost-reasons", () => {
  it("adaugă un motiv nou, îl redenumește, apoi îl șterge", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);
    await app.request("/api/crm/lost-reasons"); // seed implicit (6 motive)

    const createRes = await app.request("/api/crm/lost-reasons", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Ofertă concurentă mai bună" }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.orderIndex).toBe(6); // ultimul, după cele 6 implicite

    const patchRes = await app.request(`/api/crm/lost-reasons/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Concurență — preț mai bun" }),
    });
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).label).toBe("Concurență — preț mai bun");

    const deleteRes = await app.request(`/api/crm/lost-reasons/${created.id}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(200);

    const { items } = await (await app.request("/api/crm/lost-reasons")).json();
    expect(items).toHaveLength(6); // înapoi la cele implicite
  });

  it("reordonarea rescrie orderIndex după poziția din listă", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);
    const { items } = await (await app.request("/api/crm/lost-reasons")).json();
    const reversedIds = items.map((r: { id: string }) => r.id).reverse();

    const res = await app.request("/api/crm/lost-reasons/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: reversedIds }),
    });
    expect(res.status).toBe(200);
    const { items: reordered } = await res.json();
    expect(reordered.map((r: { id: string }) => r.id)).toEqual(reversedIds);
    expect(reordered.map((r: { label: string }) => r.label)).toEqual([
      "Altul",
      "Buget amânat",
      "Nu răspunde",
      "Nu mai are nevoie",
      "A ales alt furnizor",
      "Preț prea mare",
    ]);
  });
});

describe("Izolare multi-tenant — motive de pierdere", () => {
  it("[blocant] motivele unui tenant nu sunt vizibile și nu pot fi modificate din altul", async () => {
    const tenant1 = await createFreshTenant();
    const tenant2 = await createFreshTenant();

    loginAs(tenant1);
    const { items } = await (await app.request("/api/crm/lost-reasons")).json();
    const targetId = items[0].id;

    loginAs(tenant2);
    const patchRes = await app.request(`/api/crm/lost-reasons/${targetId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Am furat motivul" }),
    });
    expect(patchRes.status).toBe(404);

    const deleteRes = await app.request(`/api/crm/lost-reasons/${targetId}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(404);

    // Tenantul 2 are propriile lui 6 motive implicite, independente.
    const own = await (await app.request("/api/crm/lost-reasons")).json();
    expect(own.items).toHaveLength(6);
  });
});

// ─── POST /api/crm/tags ─────────────────────────────────────────────────────────

describe("POST /api/crm/tags", () => {
  it("o etichetă adăugată de două ori nu se dublează", async () => {
    const lead = await createLead({ fullName: "Lead cu etichete" });

    const first = await app.request("/api/crm/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, tag: "vip" }),
    });
    expect(first.status).toBe(201);

    const second = await app.request("/api/crm/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId: lead.id, tag: "vip" }),
    });
    expect(second.status).toBe(200); // există deja — întors ca atare, nu duplicat

    const { items } = await (await app.request(`/api/crm/tags?leadId=${lead.id}`)).json();
    expect(items).toHaveLength(1);
    expect(items[0].tag).toBe("vip");
  });

  it("respinge adăugarea pe un lead dintr-un alt tenant, cu 404", async () => {
    currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bogdan@tasks-b.md" };
    const leadB = await createLead({ fullName: "Lead tenant B" });
    currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "andreea@tasks-a.md" };

    const res = await app.request("/api/crm/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ leadId: leadB.id, tag: "nu ar trebui" }),
    });
    expect(res.status).toBe(404);
  });
});

// ─── GET /api/crm/tags/suggestions ──────────────────────────────────────────────

describe("GET /api/crm/tags/suggestions", () => {
  it("întoarce etichetele distincte ale tenantului, sortate, fără dubluri", async () => {
    const l1 = await createLead({ fullName: "Lead 1" });
    const l2 = await createLead({ fullName: "Lead 2" });
    const pairs: Array<[string, string]> = [
      [l1.id, "urgent"],
      [l2.id, "urgent"],
      [l1.id, "corporate"],
    ];
    for (const [leadId, tag] of pairs) {
      await app.request("/api/crm/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId, tag }),
      });
    }

    const { items } = await (await app.request("/api/crm/tags/suggestions")).json();
    expect(items).toEqual(["corporate", "urgent"]);
  });
});

// ─── DELETE /api/crm/tags/:id ────────────────────────────────────────────────────

describe("DELETE /api/crm/tags/:id", () => {
  it("șterge o etichetă", async () => {
    const lead = await createLead();
    const created = await (
      await app.request("/api/crm/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, tag: "de șters" }),
      })
    ).json();

    const res = await app.request(`/api/crm/tags/${created.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const { items } = await (await app.request(`/api/crm/tags?leadId=${lead.id}`)).json();
    expect(items).toHaveLength(0);
  });

  it("un id dintr-un alt tenant răspunde 404, nu șterge nimic", async () => {
    const lead = await createLead();
    const created = await (
      await app.request("/api/crm/tags", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, tag: "protejată" }),
      })
    ).json();

    currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bogdan@tasks-b.md" };
    const res = await app.request(`/api/crm/tags/${created.id}`, { method: "DELETE" });
    expect(res.status).toBe(404);

    currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "andreea@tasks-a.md" };
    const { items } = await (await app.request(`/api/crm/tags?leadId=${lead.id}`)).json();
    expect(items).toHaveLength(1);
  });
});

describe("CRM-U04 — taskul cu oră", () => {
  it("[blocant] ora aleasă se păstrează; fără oră taskul rămâne „toată ziua”", async () => {
    const lead = await createLead();
    const timed = await createTask(lead.id, { title: "Sună la 14:30", dueAt: "2026-09-27T11:30:00.000Z", dueHasTime: true });
    const allDay = await createTask(lead.id, { title: "Trimite oferta", dueAt: "2026-09-27T09:00:00.000Z" });
    expect(timed.dueHasTime).toBe(true);
    expect(allDay.dueHasTime).toBe(false);
  });

  it("[blocant] fără scadență, „cu oră” nu are sens — se salvează fals; ștergerea datei șterge și ora", async () => {
    const lead = await createLead();
    const noDate = await createTask(lead.id, { title: "Fără dată", dueHasTime: true });
    expect(noDate.dueHasTime).toBe(false);

    const timed = await createTask(lead.id, { title: "Cu oră", dueAt: "2026-09-27T11:30:00.000Z", dueHasTime: true });
    const res = await app.request(`/api/crm/tasks/${timed.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dueAt: null }),
    });
    const updated = (await res.json()) as { dueHasTime: boolean; dueAt: string | null };
    expect(updated.dueAt).toBeNull();
    expect(updated.dueHasTime).toBe(false);
  });
});

describe("Reparații e2e satelite — taskuri, etichete, motive", () => {
  const json = (method: string, body: unknown) => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  it("[blocant] încheierea lasă o urmă „system” în istoric, o singură dată (T-CRM-107-3)", async () => {
    const lead = await createLead();
    const task = await createTask(lead.id, { title: "Trimite oferta semnată" });
    expect((await app.request(`/api/crm/tasks/${task.id}/complete`, { method: "POST" })).status).toBe(200);
    expect((await app.request(`/api/crm/tasks/${task.id}/complete`, { method: "POST" })).status).toBe(200);
    const rows = await testDb.select().from(leadInteractions).where(eq(leadInteractions.leadId, lead.id));
    const traces = rows.filter((r) => r.type === "system" && (r.body ?? "").includes("Trimite oferta semnată"));
    expect(traces).toHaveLength(1);
  });

  it("[blocant] taskul amânat rămâne în clopoțel și e pas următor", async () => {
    const lead = await createLead({ fullName: "Amânat" });
    const task = await createTask(lead.id, { dueAt: new Date(Date.now() + 86_400_000).toISOString() });
    await app.request(`/api/crm/tasks/${task.id}/snooze`, json("POST", { days: 1 }));
    const { items } = await (await app.request("/api/crm/tasks?scope=upcoming")).json();
    expect(items.some((x: { id: string }) => x.id === task.id)).toBe(true);
    const today = await (await app.request("/api/crm/tasks/today")).json();
    expect(today.noNextStep.some((l: { id: string }) => l.id === lead.id)).toBe(false);
  });

  it("[blocant] responsabil inexistent sau din alt workspace → 400, nu 500", async () => {
    const lead = await createLead();
    const ghost = await app.request("/api/crm/tasks", json("POST", { leadId: lead.id, title: "X", assignedTo: "11111111-1111-4111-8111-111111111111" }));
    expect(ghost.status).toBe(400);
    const foreign = await app.request("/api/crm/tasks", json("POST", { leadId: lead.id, title: "X", assignedTo: userB }));
    expect(foreign.status).toBe(400);
    const task = await createTask(lead.id);
    expect((await app.request(`/api/crm/tasks/${task.id}`, json("PATCH", { assignedTo: userB }))).status).toBe(400);
    expect((await app.request(`/api/crm/tasks/${task.id}`, json("PATCH", { assignedTo: userA2 }))).status).toBe(200);
  });

  it("[blocant] PATCH doar cu dueHasTime pe un task cu dată păstrează ora", async () => {
    const lead = await createLead();
    const task = await createTask(lead.id, { dueAt: "2026-09-27T09:00:00.000Z" });
    expect(task.dueHasTime).toBe(false);
    const updated = await (await app.request(`/api/crm/tasks/${task.id}`, json("PATCH", { dueHasTime: true }))).json();
    expect(updated.dueHasTime).toBe(true);
  });

  it("[blocant] textul doar din spații e refuzat: titlu task, etichetă, motiv de pierdere", async () => {
    const lead = await createLead();
    expect((await app.request("/api/crm/tasks", json("POST", { leadId: lead.id, title: "   " }))).status).toBe(400);
    const task = await createTask(lead.id);
    expect((await app.request(`/api/crm/tasks/${task.id}`, json("PATCH", { title: "  " }))).status).toBe(400);
    expect((await app.request("/api/crm/tags", json("POST", { leadId: lead.id, tag: "   " }))).status).toBe(400);
    expect((await app.request("/api/crm/lost-reasons", json("POST", { label: "  " }))).status).toBe(400);
    const created = await (await app.request("/api/crm/lost-reasons", json("POST", { label: "  Prea departe  " }))).json();
    expect(created.label).toBe("Prea departe");
    expect((await app.request(`/api/crm/lost-reasons/${created.id}`, json("PATCH", { label: " " }))).status).toBe(400);
  });
});
