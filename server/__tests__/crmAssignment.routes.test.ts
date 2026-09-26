/**
 * @vitest-environment node
 *
 * Distribuirea automată a lead-urilor, pe rutele reale.
 *
 * Ce se apără aici, în ordinea gravității:
 *  1. Un lead nu poate ajunge la un om din alt workspace. Nu există RLS — doar
 *     filtrul scris de mână în fiecare query; o scăpare pune datele unui client
 *     pe ecranul altuia.
 *  2. Împărțirea e echitabilă. Un round-robin care dă totul primului din listă
 *     arată că funcționează exact până se uită cineva la cifre, adică târziu.
 *  3. Niciun lead nu dispare în tăcere. Neatribuit e un rezultat acceptabil;
 *     neatribuit fără explicație nu e.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, leads, leadInteractions } from "../db/schema";
import { crmCompanies } from "../db/schema/crmCompanies";
import { crmAssignmentRules, crmSalesSettings, crmAssignmentLog } from "../db/schema/crmAutomations";
import { planRebalance, type AssignmentLead, type AssignmentMember, type AssignmentRuleView } from "../lib/crm/assignment";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let tenantB: string;
let ana: string;
let bogdan: string;
let corina: string;
let elev: string;
let userB: string;
let currentUser: { id: string; tenantId: string; role: string; email: string };

// Getter, nu valoare: `testDb` se construiește abia în beforeAll, iar o
// referință simplă ar îngheța `undefined` în modulul de rute.
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
let assignLeadAutomatically: (typeof import("../routes/crmAssignment"))["assignLeadAutomatically"];

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

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const mod = await import("../routes/crmAssignment");
  assignLeadAutomatically = mod.assignLeadAutomatically;
  app = new Hono();
  app.route("/api/crm/assignment", mod.crmAssignmentRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Alfa", slug: "alfa-distribuire" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Beta", slug: "beta-distribuire" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;

  const inserted = await testDb
    .insert(users)
    .values([
      { tenantId: tenantA, email: "ana@alfa.md", passwordHash: "x", name: "Ana", role: "manager" },
      { tenantId: tenantA, email: "bogdan@alfa.md", passwordHash: "x", name: "Bogdan", role: "manager" },
      { tenantId: tenantA, email: "corina@alfa.md", passwordHash: "x", name: "Corina", role: "manager" },
      { tenantId: tenantA, email: "elev@alfa.md", passwordHash: "x", name: "Elev Test", role: "student" },
      { tenantId: tenantB, email: "bo@beta.md", passwordHash: "x", name: "Bo", role: "manager" },
    ])
    .returning();
  ana = inserted[0].id;
  bogdan = inserted[1].id;
  corina = inserted[2].id;
  elev = inserted[3].id;
  userB = inserted[4].id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(crmAssignmentLog);
  await testDb.delete(leadInteractions);
  await testDb.delete(crmSalesSettings);
  await testDb.delete(crmAssignmentRules);
  await testDb.delete(leads);
  await testDb.delete(crmCompanies);
  currentUser = { id: ana, tenantId: tenantA, role: "admin", email: "ana@alfa.md" };
});

// ─── Ajutoare ────────────────────────────────────────────────────────────────

async function makeLead(tenantId: string, fullName: string, extra: Record<string, unknown> = {}) {
  const [row] = await testDb
    .insert(leads)
    .values({ tenantId, fullName, stage: "new", ...extra })
    .returning();
  return row;
}

async function makeRule(
  tenantId: string,
  patch: Partial<typeof crmAssignmentRules.$inferInsert> = {}
) {
  const [row] = await testDb
    .insert(crmAssignmentRules)
    .values({ tenantId, name: "Distribuire", strategy: "round_robin", ...patch })
    .returning();
  return row;
}

async function setSettings(
  tenantId: string,
  userId: string,
  patch: Partial<typeof crmSalesSettings.$inferInsert> = {}
) {
  await testDb.insert(crmSalesSettings).values({ tenantId, userId, ...patch });
}

interface DecisionBody {
  decision: {
    userId: string | null;
    ruleId: string | null;
    ruleName: string | null;
    strategy: string | null;
    reason: string;
    outcome: string;
  };
  userName: string | null;
}

async function post(pathname: string, body: unknown) {
  return app.request(`/api/crm/assignment${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function applyTo(leadId: string): Promise<DecisionBody> {
  const res = await post("/apply", { leadId });
  expect(res.status).toBe(200);
  return (await res.json()) as DecisionBody;
}

async function assignedToOf(leadId: string): Promise<string | null> {
  const [row] = await testDb.select().from(leads).where(eq(leads.id, leadId));
  return row.assignedTo;
}

// ─── Izolarea între workspace-uri ────────────────────────────────────────────

describe("Izolarea între workspace-uri", () => {
  it("[blocant] un lead nu poate fi atribuit unui om din alt workspace", async () => {
    // Regula cere explicit omul din workspace-ul Beta. Chiar și așa, el nu e în
    // rosterul lui Alfa, deci nu poate fi ales niciodată.
    await makeRule(tenantA, { name: "Doar Bo", userIds: [userB] });
    const lead = await makeLead(tenantA, "Ion Popescu");

    const body = await applyTo(lead.id);
    expect(body.decision.userId).toBeNull();
    expect(body.decision.outcome).toBe("no_candidates");
    expect(await assignedToOf(lead.id)).toBeNull();
  });

  it("[blocant] oamenii altui workspace nu apar în tragere", async () => {
    const res = await app.request("/api/crm/assignment/members");
    const body = (await res.json()) as { items: Array<{ userId: string; name: string }> };
    const ids = body.items.map((m) => m.userId);
    expect(ids).toContain(ana);
    expect(ids).not.toContain(userB);
    // Contul de elev e utilizator al firmei, dar nu om de vânzări.
    expect(ids).not.toContain(elev);
  });

  it("[blocant] setările de vânzări nu pot fi scrise pentru un om din alt workspace", async () => {
    const res = await app.request(`/api/crm/assignment/members/${userB}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dailyCapacity: 99 }),
    });
    expect(res.status).toBe(404);

    const rows = await testDb.select().from(crmSalesSettings).where(eq(crmSalesSettings.userId, userB));
    expect(rows).toHaveLength(0);
  });

  it("[blocant] regulile unui workspace nu se văd din altul", async () => {
    const created = await post("/rules", { name: "Campania Alfa secretă" });
    expect(created.status).toBe(201);
    const rule = (await created.json()) as { id: string };

    currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bo@beta.md" };

    const list = await app.request("/api/crm/assignment/rules");
    expect(JSON.stringify(await list.json())).not.toContain("Alfa secretă");

    // Și nici modificate sau șterse „din greșeală" cu id-ul corect.
    const patched = await app.request(`/api/crm/assignment/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(patched.status).toBe(404);

    const deleted = await app.request(`/api/crm/assignment/rules/${rule.id}`, { method: "DELETE" });
    expect(deleted.status).toBe(404);

    const [still] = await testDb.select().from(crmAssignmentRules).where(eq(crmAssignmentRules.id, rule.id));
    expect(still.enabled).toBe(true);
  });

  it("[blocant] jurnalul altui workspace nu se vede", async () => {
    await makeRule(tenantA);
    const lead = await makeLead(tenantA, "Ion Popescu");
    await applyTo(lead.id);

    currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bo@beta.md" };
    const res = await app.request("/api/crm/assignment/log");
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });
});

// ─── Echitatea împărțirii ────────────────────────────────────────────────────

describe("Cum se împarte", () => {
  it("[blocant] round-robin împarte echitabil, nu dă totul primului", async () => {
    await makeRule(tenantA, { name: "Toți pe rând", strategy: "round_robin" });

    const counts = new Map<string, number>();
    for (let i = 0; i < 6; i++) {
      const lead = await makeLead(tenantA, `Lead ${i}`);
      const body = await applyTo(lead.id);
      expect(body.decision.userId).not.toBeNull();
      const key = body.decision.userId as string;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    // Trei agenți, șase lead-uri: exact două de fiecare. Orice altă distribuție
    // înseamnă că cineva stă degeaba și altcineva nu mai apucă să sune.
    expect([...counts.values()].sort()).toEqual([2, 2, 2]);
    expect(counts.size).toBe(3);
  });

  it("[blocant] un agent scos din tragere (isActive=false) nu mai primește lead-uri", async () => {
    const res = await app.request(`/api/crm/assignment/members/${bogdan}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    expect(res.status).toBe(200);

    await makeRule(tenantA, { strategy: "round_robin" });

    const owners: string[] = [];
    for (let i = 0; i < 4; i++) {
      const lead = await makeLead(tenantA, `Lead ${i}`);
      const body = await applyTo(lead.id);
      owners.push(body.decision.userId as string);
    }

    expect(owners).not.toContain(bogdan);
    // Restul echipei preia tot, nu rămâne nimic nedistribuit.
    expect(owners.filter(Boolean)).toHaveLength(4);
  });

  it("distribuția ponderată dă mai mult celui cu greutate mai mare", async () => {
    await setSettings(tenantA, ana, { weight: 3, orderIndex: 0 });
    await setSettings(tenantA, bogdan, { weight: 1, orderIndex: 1 });
    await setSettings(tenantA, corina, { isActive: false, orderIndex: 2 });
    await makeRule(tenantA, { name: "După încărcare", strategy: "weighted" });

    const counts = new Map<string, number>();
    for (let i = 0; i < 8; i++) {
      const lead = await makeLead(tenantA, `Lead ${i}`);
      const body = await applyTo(lead.id);
      const key = body.decision.userId as string;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    expect(counts.get(ana) ?? 0).toBeGreaterThan(counts.get(bogdan) ?? 0);
    expect((counts.get(ana) ?? 0) + (counts.get(bogdan) ?? 0)).toBe(8);
  });

  it("regula pe teritoriu dă lead-ul agentului care acoperă regiunea", async () => {
    const [firma] = await testDb
      .insert(crmCompanies)
      .values({ tenantId: tenantA, name: "Agro Nord SRL", region: "Nord", industry: "agricultură" })
      .returning();

    await setSettings(tenantA, ana, { regions: ["Nord"], orderIndex: 0 });
    await setSettings(tenantA, bogdan, { regions: ["Sud"], orderIndex: 1 });
    await setSettings(tenantA, corina, { regions: ["Centru"], orderIndex: 2 });
    await makeRule(tenantA, { name: "Pe zone", strategy: "territory" });

    const lead = await makeLead(tenantA, "Vasile din Nord", { companyId: firma.id });
    const body = await applyTo(lead.id);

    expect(body.decision.userId).toBe(ana);
    expect(body.userName).toBe("Ana");
    expect(await assignedToOf(lead.id)).toBe(ana);
  });

  it("teritoriu fără acoperire: lead-ul rămâne neatribuit, cu motivul scris", async () => {
    const [firma] = await testDb
      .insert(crmCompanies)
      .values({ tenantId: tenantA, name: "Vest SRL", region: "Vest" })
      .returning();
    await setSettings(tenantA, ana, { regions: ["Nord"] });
    await setSettings(tenantA, bogdan, { regions: ["Sud"] });
    await setSettings(tenantA, corina, { regions: ["Centru"] });
    await makeRule(tenantA, { name: "Pe zone", strategy: "territory" });

    const lead = await makeLead(tenantA, "Client din Vest", { companyId: firma.id });
    const body = await applyTo(lead.id);

    expect(body.decision.userId).toBeNull();
    expect(body.decision.outcome).toBe("no_candidates");
    expect(body.decision.reason).toContain("zona");

    const log = await testDb.select().from(crmAssignmentLog).where(eq(crmAssignmentLog.leadId, lead.id));
    expect(log).toHaveLength(1);
  });

  it("prima regulă potrivită câștigă — nu se cumulează cu următoarele", async () => {
    await makeRule(tenantA, {
      name: "Doar Ana",
      strategy: "fixed",
      userIds: [ana],
      orderIndex: 0,
      conditions: [{ field: "source", op: "eq", value: "referral" }],
    });
    await makeRule(tenantA, { name: "Restul", strategy: "fixed", userIds: [bogdan], orderIndex: 1 });

    const recomandat = await makeLead(tenantA, "Vine din recomandare", { source: "referral" });
    const oarecare = await makeLead(tenantA, "Vine de pe site", { source: "webform" });

    expect((await applyTo(recomandat.id)).decision.userId).toBe(ana);
    expect((await applyTo(oarecare.id)).decision.userId).toBe(bogdan);
  });

  it("[blocant] o regulă cu condiții scrisă DUPĂ scenariul „pe rând, la toți” tot rulează", async () => {
    // CRM-A02: scenariul pornit întâi prinde tot. Dacă ordinea ar fi doar cea de creare, regula
    // „recomandările la Ana" ar arăta „Pornită" și n-ar prinde niciodată nimic.
    await makeRule(tenantA, { name: "Pe rând, la toată echipa", strategy: "fixed", userIds: [bogdan], orderIndex: 0 });
    await makeRule(tenantA, {
      name: "Recomandările la Ana",
      strategy: "fixed",
      userIds: [ana],
      orderIndex: 1,
      conditions: [{ field: "source", op: "in", value: "referral, phone_in" }],
    });

    const recomandat = await makeLead(tenantA, "Vine din recomandare", { source: "referral" });
    const oarecare = await makeLead(tenantA, "Vine de pe site", { source: "webform" });

    expect((await applyTo(recomandat.id)).decision.userId).toBe(ana);
    expect((await applyTo(oarecare.id)).decision.userId).toBe(bogdan);
  });
});

// ─── Capacitate ──────────────────────────────────────────────────────────────

describe("Capacitate zilnică", () => {
  it("[blocant] la capacitate atinsă, lead-ul NU se pierde", async () => {
    // Doi agenți, câte un lead pe zi fiecare; al treilea e scos din tragere.
    await setSettings(tenantA, ana, { dailyCapacity: 1, orderIndex: 0 });
    await setSettings(tenantA, bogdan, { dailyCapacity: 1, orderIndex: 1 });
    await setSettings(tenantA, corina, { isActive: false, orderIndex: 2 });
    await makeRule(tenantA, { name: "După capacitate", strategy: "capacity" });

    const primul = await makeLead(tenantA, "Lead 1");
    const alDoilea = await makeLead(tenantA, "Lead 2");
    const alTreilea = await makeLead(tenantA, "Lead 3");

    expect((await applyTo(primul.id)).decision.userId).toBe(ana);

    // PRIMA plasă: cu Ana plină, lead-ul cade pe colegul care mai are loc.
    expect((await applyTo(alDoilea.id)).decision.userId).toBe(bogdan);

    // A DOUA plasă: când chiar nu mai are nimeni loc, lead-ul rămâne
    // neatribuit — dar cu un rând în jurnal care spune exact de ce. Nu dispare
    // și nu e împins peste norma cuiva.
    const body = await applyTo(alTreilea.id);
    expect(body.decision.userId).toBeNull();
    expect(body.decision.outcome).toBe("all_at_capacity");
    expect(body.decision.reason).toContain("norma zilnică");

    expect(await assignedToOf(alTreilea.id)).toBeNull();
    const log = await testDb
      .select()
      .from(crmAssignmentLog)
      .where(eq(crmAssignmentLog.leadId, alTreilea.id));
    expect(log).toHaveLength(1);
    expect(log[0].userId).toBeNull();
    expect(log[0].reason ?? "").toContain("norma zilnică");
  });

  it("capacitatea 0 înseamnă nelimitat, nu „nu primește nimic\"", async () => {
    await setSettings(tenantA, ana, { dailyCapacity: 0, orderIndex: 0 });
    await setSettings(tenantA, bogdan, { isActive: false });
    await setSettings(tenantA, corina, { isActive: false });
    await makeRule(tenantA, { strategy: "capacity" });

    for (let i = 0; i < 3; i++) {
      const lead = await makeLead(tenantA, `Lead ${i}`);
      expect((await applyTo(lead.id)).decision.userId).toBe(ana);
    }
  });

  it("GET /members arată câte lead-uri a primit fiecare azi", async () => {
    await makeRule(tenantA, { strategy: "fixed", userIds: [ana] });
    const lead = await makeLead(tenantA, "Ion");
    await applyTo(lead.id);

    const res = await app.request("/api/crm/assignment/members");
    const body = (await res.json()) as { items: Array<{ userId: string; assignedToday: number; dailyCapacity: number }> };
    const row = body.items.find((m) => m.userId === ana);
    expect(row?.assignedToday).toBe(1);
    // Fără rând de setări, omul are valorile implicite — nu lipsește din listă.
    expect(row?.dailyCapacity).toBe(20);
  });

  it("modificarea setărilor întoarce omul, nu rândul brut, și nu strică ce nu s-a trimis", async () => {
    async function patchMember(body: unknown) {
      const res = await app.request(`/api/crm/assignment/members/${ana}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(200);
      return (await res.json()) as { userId: string; name: string; dailyCapacity: number; weight: number; assignedToday: number };
    }

    const first = await patchMember({ dailyCapacity: 5 });
    expect(first.userId).toBe(ana);
    expect(first.name).toBe("Ana");
    expect(first.dailyCapacity).toBe(5);
    expect(first.assignedToday).toBe(0);

    // A doua modificare atinge doar greutatea; capacitatea pusă adineaori rămâne.
    const second = await patchMember({ weight: 3 });
    expect(second.weight).toBe(3);
    expect(second.dailyCapacity).toBe(5);
  });
});

// ─── Explicația ──────────────────────────────────────────────────────────────

describe("De ce a primit omul lead-ul", () => {
  it("jurnalul spune DE CE a primit omul lead-ul", async () => {
    await makeRule(tenantA, { name: "Lead-uri din reclame", strategy: "round_robin" });
    const lead = await makeLead(tenantA, "Ion Popescu");
    const body = await applyTo(lead.id);

    const res = await app.request(`/api/crm/assignment/log?leadId=${lead.id}`);
    const log = (await res.json()) as {
      items: Array<{ userId: string | null; userName: string | null; ruleName: string | null; strategy: string | null; reason: string }>;
    };
    expect(log.items).toHaveLength(1);
    const entry = log.items[0];
    expect(entry.userId).toBe(body.decision.userId);
    expect(entry.userName).toBeTruthy();
    expect(entry.ruleName).toBe("Lead-uri din reclame");
    expect(entry.strategy).toBe("round_robin");
    expect(entry.reason).toContain("Lead-uri din reclame");
  });

  it("explicația apare și în istoricul lead-ului, unde se uită omul de vânzări", async () => {
    await makeRule(tenantA, { name: "Toți pe rând" });
    const lead = await makeLead(tenantA, "Ion Popescu");
    await applyTo(lead.id);

    const rows = await testDb.select().from(leadInteractions).where(eq(leadInteractions.leadId, lead.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("system");
    expect(rows[0].body ?? "").toContain("Atribuit automat");
    expect(rows[0].body ?? "").toContain("Toți pe rând");
  });

  it("previzualizarea spune cui i-ar reveni, fără să scrie nimic", async () => {
    await makeRule(tenantA, { name: "Toți pe rând" });
    const lead = await makeLead(tenantA, "Ion Popescu");

    const res = await post("/preview", { leadId: lead.id });
    expect(res.status).toBe(200);
    const body = (await res.json()) as DecisionBody & { candidates: unknown[] };
    expect(body.decision.userId).not.toBeNull();
    expect(body.userName).toBeTruthy();
    expect(body.candidates).toHaveLength(3);

    // Nimic scris: nici pe lead, nici în jurnal.
    expect(await assignedToOf(lead.id)).toBeNull();
    expect(await testDb.select().from(crmAssignmentLog)).toHaveLength(0);
  });

  it("un lead din alt workspace nu poate fi nici măcar previzualizat", async () => {
    const theirs = await makeLead(tenantB, "Lead-ul lor");
    const res = await post("/preview", { leadId: theirs.id });
    expect(res.status).toBe(404);
  });
});

// ─── Fără reguli ─────────────────────────────────────────────────────────────

describe("Fără reguli active", () => {
  it("fără nicio regulă activă, lead-ul rămâne neatribuit — nu se inventează un responsabil", async () => {
    // Regula există, dar e oprită: cazul realist, nu unul de laborator.
    await makeRule(tenantA, { name: "Oprită temporar", enabled: false });
    const lead = await makeLead(tenantA, "Ion Popescu");

    const body = await applyTo(lead.id);
    expect(body.decision.userId).toBeNull();
    expect(body.decision.outcome).toBe("no_rule");
    expect(await assignedToOf(lead.id)).toBeNull();
  });

  it("cârligul automat nu umple jurnalul într-un workspace care n-a pornit distribuirea", async () => {
    const lead = await makeLead(tenantA, "Ion Popescu");
    const decision = await assignLeadAutomatically(tenantA, { ...lead });

    expect(decision).toBeNull();
    expect(await testDb.select().from(crmAssignmentLog)).toHaveLength(0);
  });
});

// ─── Cârligul de la crearea lead-ului ────────────────────────────────────────

describe("assignLeadAutomatically", () => {
  it("atribuie lead-ul nou și lasă urmă în jurnal", async () => {
    await makeRule(tenantA, { name: "Toți pe rând" });
    const lead = await makeLead(tenantA, "Ion Popescu");

    const decision = await assignLeadAutomatically(tenantA, { ...lead });
    expect(decision?.userId).toBeTruthy();
    expect(await assignedToOf(lead.id)).toBe(decision?.userId ?? null);
    expect(await testDb.select().from(crmAssignmentLog)).toHaveLength(1);
  });

  it("[blocant] nu fură un lead care are deja responsabil", async () => {
    await makeRule(tenantA, { name: "Toți pe rând", userIds: [bogdan] });
    const lead = await makeLead(tenantA, "Ion Popescu", { assignedTo: ana });

    const decision = await assignLeadAutomatically(tenantA, { ...lead });
    expect(decision).toBeNull();
    expect(await assignedToOf(lead.id)).toBe(ana);
  });

  it("[blocant] nu atribuie unui om din alt workspace nici pe calea automată", async () => {
    await makeRule(tenantA, { name: "Doar Bo", userIds: [userB] });
    const lead = await makeLead(tenantA, "Ion Popescu");

    const decision = await assignLeadAutomatically(tenantA, { ...lead });
    expect(decision?.userId ?? null).toBeNull();
    expect(await assignedToOf(lead.id)).toBeNull();
  });
});

// ─── Lotul (funcția pură) ────────────────────────────────────────────────────

describe("planRebalance", () => {
  it("împarte lotul între agenți, nu dă tot primului", () => {
    const members: AssignmentMember[] = [
      { userId: "u1", name: "Ana", isActive: true, dailyCapacity: 20, weight: 1, regions: [], industries: [], orderIndex: 0, assignedToday: 0 },
      { userId: "u2", name: "Bogdan", isActive: true, dailyCapacity: 20, weight: 1, regions: [], industries: [], orderIndex: 1, assignedToday: 0 },
    ];
    const rules: AssignmentRuleView[] = [
      { id: "r1", name: "Toți pe rând", enabled: true, strategy: "round_robin", conditions: [], userIds: [], orderIndex: 0 },
    ];
    const leadList: AssignmentLead[] = [{ id: "l1" }, { id: "l2" }, { id: "l3" }, { id: "l4" }];

    const plan = planRebalance(leadList, rules, members, null);
    const owners = plan.map((p) => p.decision.userId);
    expect(owners).toEqual(["u1", "u2", "u1", "u2"]);

    // Rosterul primit nu se modifică — altfel apelantul ar rămâne cu contoare
    // umflate de o simplă previzualizare.
    expect(members[0].assignedToday).toBe(0);
  });
});
