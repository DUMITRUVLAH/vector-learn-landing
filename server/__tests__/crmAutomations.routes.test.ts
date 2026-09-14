/**
 * @vitest-environment node
 *
 * Automatizări: reguli care mișcă singure lead-urile.
 *
 * Modulul ăsta e cel mai periculos din tot CRM-ul, fiindcă e singurul care
 * scrie în bază FĂRĂ ca cineva să fi apăsat ceva în clipa aceea. O regulă
 * greșită lucrează tăcut, noaptea, peste mii de lead-uri.
 *
 * Testele urmăresc, în ordinea gravității:
 *  1. o automatizare nu poate atinge lead-urile altui workspace;
 *  2. o automatizare picată NU strică acțiunea omului — lead-ul rămâne salvat;
 *  3. două reguli care se cheamă reciproc nu rulează la infinit;
 *  4. tot ce face o regulă rămâne explicabil după fapt.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, leads, leadInteractions, leadTags } from "../db/schema";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { crmLeadTasks } from "../db/schema/crmTasks";
import { crmAutomations, crmAutomationRuns } from "../db/schema/crmAutomations";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let tenantB: string;
let anaId: string;
let boId: string;
let currentUser: { id: string; tenantId: string; role: string; email: string };

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
let runAutomations: typeof import("../routes/crmAutomations").runAutomations;

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

async function post(url: string, body: unknown) {
  const res = await app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const mod = await import("../routes/crmAutomations");
  runAutomations = mod.runAutomations;
  app = new Hono();
  app.route("/api/crm/automations", mod.crmAutomationsRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Alfa", slug: "alfa-auto" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Beta", slug: "beta-auto" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;

  const [ana] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@alfa.md", passwordHash: "x", name: "Ana Pop", role: "admin" })
    .returning();
  const [bo] = await testDb
    .insert(users)
    .values({ tenantId: tenantB, email: "bo@beta.md", passwordHash: "x", name: "Bo Rusu", role: "admin" })
    .returning();
  anaId = ana.id;
  boId = bo.id;

  // Aceeași pâlnie în ambele workspace-uri, ca testele de izolare să nu treacă
  // din întâmplare, fiindcă etapa lipsea la celălalt.
  for (const t of [tenantA, tenantB]) {
    await testDb.insert(crmPipelineStages).values([
      { tenantId: t, key: "new", label: "Lead nou", orderIndex: 0 },
      { tenantId: t, key: "contacted", label: "Contactat", orderIndex: 1 },
      { tenantId: t, key: "paid", label: "Client", orderIndex: 2, isWon: true },
    ]);
  }
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(crmAutomationRuns);
  await testDb.delete(crmAutomations);
  await testDb.delete(crmLeadTasks);
  await testDb.delete(leadTags);
  await testDb.delete(leadInteractions);
  await testDb.delete(leads);
  currentUser = { id: anaId, tenantId: tenantA, role: "admin", email: "ana@alfa.md" };
});

async function makeLead(tenantId: string, over: Record<string, unknown> = {}) {
  const [row] = await testDb
    .insert(leads)
    .values({ tenantId, fullName: "Ion Popescu", stage: "new", ...over })
    .returning();
  return row;
}

/** Regulă gata de folosit, cu declanșator la creare. */
function rule(over: Record<string, unknown> = {}) {
  return {
    name: "Regula de test",
    enabled: true,
    trigger: { kind: "lead.created" },
    conditions: [],
    actions: [{ type: "add_tag", tag: "automat" }],
    ...over,
  };
}

// ─── Izolarea ────────────────────────────────────────────────────────────────

describe("izolarea între workspace-uri", () => {
  it("[blocant] o automatizare a unui workspace nu atinge lead-urile altuia", async () => {
    await post("/api/crm/automations", rule({ actions: [{ type: "add_tag", tag: "alfa-a-trecut-pe-aici" }] }));

    const theirLead = await makeLead(tenantB);
    await runAutomations({ tenantId: tenantB, userId: boId, lead: theirLead, kind: "lead.created" });

    const tags = await testDb.select().from(leadTags).where(eq(leadTags.leadId, theirLead.id));
    expect(tags).toHaveLength(0);
  });

  it("[blocant] regulile nu se văd din alt workspace", async () => {
    await post("/api/crm/automations", rule({ name: "Secretul firmei Alfa" }));

    currentUser = { id: boId, tenantId: tenantB, role: "admin", email: "bo@beta.md" };
    const res = await app.request("/api/crm/automations");
    expect(JSON.stringify(await res.json())).not.toContain("Secretul firmei Alfa");
  });

  it("[blocant] un om rămas într-o regulă după ce a plecat din firmă nu primește lead-uri", async () => {
    // `boId` e din workspace-ul Beta. O regulă din Alfa care-l numește nu are
    // voie să-i dea lead-uri — ar fi cel mai direct mod de a scurge clienți.
    await post("/api/crm/automations", rule({ actions: [{ type: "assign", userId: boId }] }));

    const lead = await makeLead(tenantA);
    await runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.created" });

    const [after] = await testDb.select().from(leads).where(eq(leads.id, lead.id));
    expect(after.assignedTo).toBeNull();
  });
});

// ─── Robustețea: o regulă proastă nu strică munca omului ─────────────────────

describe("robustețe", () => {
  it("[blocant] `runAutomations` nu aruncă NICIODATĂ", async () => {
    // Chemată din salvarea unui lead: dacă ar arunca, o regulă greșită ar face
    // imposibilă salvarea, iar omul ar pierde formularul completat.
    await testDb.insert(crmAutomations).values({
      tenantId: tenantA,
      name: "Regulă stricată",
      trigger: { kind: "lead.created" },
      conditions: [],
      // Acțiune cu formă invalidă, strecurată direct în bază (nu prin API).
      actions: [{ type: "create_task" }] as never,
    });

    const lead = await makeLead(tenantA);
    await expect(
      runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.created" })
    ).resolves.toBeDefined();
  });

  it("o regulă picată nu le oprește pe celelalte", async () => {
    await testDb.insert(crmAutomations).values([
      {
        tenantId: tenantA,
        name: "Prima, stricată",
        trigger: { kind: "lead.created" },
        conditions: [],
        actions: [{ type: "create_task" }] as never,
        orderIndex: 0,
      },
      {
        tenantId: tenantA,
        name: "A doua, bună",
        trigger: { kind: "lead.created" },
        conditions: [],
        actions: [{ type: "add_tag", tag: "a-mers" }],
        orderIndex: 1,
      },
    ]);

    const lead = await makeLead(tenantA);
    await runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.created" });

    const tags = await testDb.select().from(leadTags).where(eq(leadTags.leadId, lead.id));
    expect(tags.map((t) => t.tag)).toContain("a-mers");
  });

  it("[blocant] două reguli care se mută reciproc nu rulează la infinit", async () => {
    // Scrise de doi oameni cumsecade, în două zile diferite. Fără plafon,
    // cererea ar rula până cade.
    await testDb.insert(crmAutomations).values([
      {
        tenantId: tenantA,
        name: "Nou → Contactat",
        trigger: { kind: "lead.stage_changed", toStage: "new" },
        conditions: [],
        actions: [{ type: "move_stage", stageKey: "contacted" }],
        orderIndex: 0,
      },
      {
        tenantId: tenantA,
        name: "Contactat → Nou",
        trigger: { kind: "lead.stage_changed", toStage: "contacted" },
        conditions: [],
        actions: [{ type: "move_stage", stageKey: "new" }],
        orderIndex: 1,
      },
    ]);

    const lead = await makeLead(tenantA);
    const started = Date.now();
    await runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.stage_changed", toStage: "new" });

    expect(Date.now() - started).toBeLessThan(5000);
    // Și, mai important: istoricul nu s-a umplut cu zeci de mutări.
    const moves = await testDb
      .select()
      .from(leadInteractions)
      .where(eq(leadInteractions.leadId, lead.id));
    expect(moves.length).toBeLessThanOrEqual(4);
  });

  it("[blocant] o etapă care nu există în pâlnie nu ascunde lead-ul", async () => {
    // `leads.stage` e text liber: o cheie inventată ar lăsa lead-ul în bază,
    // dar în nicio coloană a pâlniei — adică invizibil pentru toată echipa.
    await testDb.insert(crmAutomations).values({
      tenantId: tenantA,
      name: "Mută în etapă inexistentă",
      trigger: { kind: "lead.created" },
      conditions: [],
      actions: [{ type: "move_stage", stageKey: "negociere-avansata" }],
    });

    const lead = await makeLead(tenantA);
    await runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.created" });

    const [after] = await testDb.select().from(leads).where(eq(leads.id, lead.id));
    const stages = await testDb
      .select({ key: crmPipelineStages.key })
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.tenantId, tenantA));
    expect(stages.map((s) => s.key)).toContain(after.stage);
  });
});

// ─── Când pornesc regulile ───────────────────────────────────────────────────

describe("declanșatoare și condiții", () => {
  it("regula de etapă pornește doar la intrarea în etapa configurată", async () => {
    await testDb.insert(crmAutomations).values({
      tenantId: tenantA,
      name: "Doar la Client",
      trigger: { kind: "lead.stage_changed", toStage: "paid" },
      conditions: [],
      actions: [{ type: "add_tag", tag: "castigat" }],
    });

    const lead = await makeLead(tenantA);
    await runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.stage_changed", toStage: "contacted" });
    expect(await testDb.select().from(leadTags).where(eq(leadTags.leadId, lead.id))).toHaveLength(0);

    await runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.stage_changed", toStage: "paid" });
    expect(await testDb.select().from(leadTags).where(eq(leadTags.leadId, lead.id))).toHaveLength(1);
  });

  it("toate condițiile trebuie să treacă, nu doar una", async () => {
    await testDb.insert(crmAutomations).values({
      tenantId: tenantA,
      name: "Lead mare cu email",
      trigger: { kind: "lead.created" },
      conditions: [
        { field: "valueCents", op: "gte", value: 100_000 },
        { field: "email", op: "exists" },
      ],
      actions: [{ type: "add_tag", tag: "prioritar" }],
    });

    // Valoare mare, dar fără email → nu se aplică.
    const fara = await makeLead(tenantA, { valueCents: 500_000 });
    await runAutomations({ tenantId: tenantA, userId: anaId, lead: fara, kind: "lead.created" });
    expect(await testDb.select().from(leadTags).where(eq(leadTags.leadId, fara.id))).toHaveLength(0);

    const cu = await makeLead(tenantA, { valueCents: 500_000, email: "ion@x.md" });
    await runAutomations({ tenantId: tenantA, userId: anaId, lead: cu, kind: "lead.created" });
    expect(await testDb.select().from(leadTags).where(eq(leadTags.leadId, cu.id))).toHaveLength(1);
  });

  it("o regulă oprită nu face nimic", async () => {
    await testDb.insert(crmAutomations).values({
      tenantId: tenantA,
      name: "Oprită",
      enabled: false,
      trigger: { kind: "lead.created" },
      conditions: [],
      actions: [{ type: "add_tag", tag: "n-ar-trebui" }],
    });

    const lead = await makeLead(tenantA);
    await runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.created" });
    expect(await testDb.select().from(leadTags).where(eq(leadTags.leadId, lead.id))).toHaveLength(0);
  });
});

// ─── Acțiunile ───────────────────────────────────────────────────────────────

describe("ce fac regulile", () => {
  it("taskul creat automat are scadență și merge la responsabilul lead-ului", async () => {
    await testDb.insert(crmAutomations).values({
      tenantId: tenantA,
      name: "Sună în 2 zile",
      trigger: { kind: "lead.created" },
      conditions: [],
      actions: [{ type: "create_task", title: "De sunat clientul", dueInDays: 2 }],
    });

    const lead = await makeLead(tenantA, { assignedTo: anaId });
    await runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.created" });

    const [task] = await testDb.select().from(crmLeadTasks).where(eq(crmLeadTasks.leadId, lead.id));
    expect(task.title).toBe("De sunat clientul");
    expect(task.assignedTo).toBe(anaId);
    expect(task.dueAt).toBeTruthy();
  });

  it("eticheta pusă de două reguli nu apare de două ori", async () => {
    await testDb.insert(crmAutomations).values([
      {
        tenantId: tenantA,
        name: "Prima",
        trigger: { kind: "lead.created" },
        conditions: [],
        actions: [{ type: "add_tag", tag: "web" }],
        orderIndex: 0,
      },
      {
        tenantId: tenantA,
        name: "A doua",
        trigger: { kind: "lead.created" },
        conditions: [],
        actions: [{ type: "add_tag", tag: "web" }],
        orderIndex: 1,
      },
    ]);

    const lead = await makeLead(tenantA);
    await runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.created" });
    expect(await testDb.select().from(leadTags).where(eq(leadTags.leadId, lead.id))).toHaveLength(1);
  });

  it("mutarea de etapă lasă urmă în istoric, marcată ca automată", async () => {
    await testDb.insert(crmAutomations).values({
      tenantId: tenantA,
      name: "Mută în Contactat",
      trigger: { kind: "lead.created" },
      conditions: [],
      actions: [{ type: "move_stage", stageKey: "contacted" }],
    });

    const lead = await makeLead(tenantA);
    await runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.created" });

    const [after] = await testDb.select().from(leads).where(eq(leads.id, lead.id));
    expect(after.stage).toBe("contacted");

    const [note] = await testDb.select().from(leadInteractions).where(eq(leadInteractions.leadId, lead.id));
    expect(note.body).toBe("new → contacted");
    expect((note.metadata as Record<string, unknown>).automation).toBe(true);
  });

  it("a doua regulă vede starea lăsată de prima, nu cea de la început", async () => {
    await testDb.insert(crmAutomations).values([
      {
        tenantId: tenantA,
        name: "Mută în Contactat",
        trigger: { kind: "lead.created" },
        conditions: [],
        actions: [{ type: "move_stage", stageKey: "contacted" }],
        orderIndex: 0,
      },
      {
        tenantId: tenantA,
        name: "Etichetează dacă e contactat",
        trigger: { kind: "lead.created" },
        conditions: [{ field: "stage", op: "eq", value: "contacted" }],
        actions: [{ type: "add_tag", tag: "in-lucru" }],
        orderIndex: 1,
      },
    ]);

    const lead = await makeLead(tenantA);
    await runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.created" });

    const tags = await testDb.select().from(leadTags).where(eq(leadTags.leadId, lead.id));
    expect(tags.map((t) => t.tag)).toContain("in-lucru");
  });
});

// ─── Explicabilitate ─────────────────────────────────────────────────────────

describe("de ce s-a mișcat singur lead-ul", () => {
  it("jurnalul spune ce regulă a rulat și ce a făcut", async () => {
    await testDb.insert(crmAutomations).values({
      tenantId: tenantA,
      name: "Etichetează leadurile de pe site",
      trigger: { kind: "lead.created" },
      conditions: [],
      actions: [{ type: "add_tag", tag: "site" }],
    });

    const lead = await makeLead(tenantA);
    await runAutomations({ tenantId: tenantA, userId: anaId, lead, kind: "lead.created" });

    const [run] = await testDb.select().from(crmAutomationRuns).where(eq(crmAutomationRuns.leadId, lead.id));
    expect(run.automationName).toBe("Etichetează leadurile de pe site");
    expect(run.status).toBe("ok");
    expect(JSON.stringify(run.actions)).toContain("add_tag");

    const res = await app.request(`/api/crm/automations/runs?leadId=${lead.id}`);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(1);
  });

  it("[blocant] previzualizarea arată ce s-ar întâmpla, fără să scrie nimic", async () => {
    await post("/api/crm/automations", rule({ actions: [{ type: "add_tag", tag: "previzualizat" }] }));
    const lead = await makeLead(tenantA);

    const res = await post("/api/crm/automations/preview", { leadId: lead.id, kind: "lead.created" });
    expect(res.status).toBe(200);
    expect((res.body.plan as { matched: boolean }[])[0].matched).toBe(true);

    expect(await testDb.select().from(leadTags).where(eq(leadTags.leadId, lead.id))).toHaveLength(0);
  });

  it("previzualizarea arată și regulile care au căzut pe condiții, nu doar pe cele care execută", async () => {
    // „Regula mea nu s-a aplicat" și „regula mea n-a fost luată în seamă" sunt
    // două probleme diferite; omul trebuie să le poată deosebi.
    await post(
      "/api/crm/automations",
      rule({ name: "Doar pentru leaduri mari", conditions: [{ field: "valueCents", op: "gte", value: 1_000_000 }] })
    );
    const lead = await makeLead(tenantA, { valueCents: 100 });

    const res = await post("/api/crm/automations/preview", { leadId: lead.id, kind: "lead.created" });
    const plan = res.body.plan as { automationName: string; matched: boolean }[];
    expect(plan).toHaveLength(1);
    expect(plan[0].matched).toBe(false);
  });
});

// ─── Validarea la salvare ────────────────────────────────────────────────────

describe("validarea regulilor", () => {
  it("[blocant] o regulă care se declanșează singură e refuzată la salvare", async () => {
    const res = await post(
      "/api/crm/automations",
      rule({
        trigger: { kind: "lead.stage_changed", toStage: "contacted" },
        actions: [{ type: "move_stage", stageKey: "contacted" }],
      })
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.problems)).toContain("la nesfârșit");
  });

  it("o atribuire fără om și fără strategie e refuzată", async () => {
    const res = await post("/api/crm/automations", rule({ actions: [{ type: "assign" }] }));
    expect(res.status).toBe(400);
  });

  it("o regulă fără nicio acțiune e refuzată", async () => {
    const res = await post("/api/crm/automations", rule({ actions: [] }));
    expect(res.status).toBe(400);
  });
});
