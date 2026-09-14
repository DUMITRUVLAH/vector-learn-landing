/**
 * @vitest-environment node
 * CADENȚE + REACTIVARE — INTEGRATION (rutele și motorul real, PGlite, toate migrările).
 *
 * Portare din crm-vector (`cadences.ts`, `reengagement.ts`). Ce trebuie să fie adevărat:
 *  - un pas scadent chiar SE APRINDE (creează taskul/nota) și se reprogramează următorul;
 *  - un pas care nu e încă scadent NU se aprinde;
 *  - o regulă de reactivare trezește un lead o SINGURĂ dată, oricât de des rulează cronul;
 *  - un lead revenit la viață nu mai e trezit niciodată;
 *  - nimic nu trece granița workspace-ului.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads, leadInteractions, leadTags } from "../db/schema/leads";
import { crmLeadTasks } from "../db/schema/crmTasks";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { crmCadences, crmCadenceEnrollments, crmReengagementRules, crmReengagementRuns } from "../db/schema/crmCadences";

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
let vectorTenant: string;
let aticTenant: string;
let ana: string;
let borisAtic: string;

const DAY = 86_400_000;

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

async function post(url: string, body?: unknown) {
  const res = await app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

async function mkLead(tenantId: string, fullName: string, stage = "new") {
  const [row] = await testDb
    .insert(leads)
    .values({ tenantId, fullName, stage, source: "manual" })
    .returning();
  return row.id;
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmCadencesRoutes } = await import("../routes/crmCadences");
  app = new Hono();
  app.route("/api/crm/cadences", crmCadencesRoutes);

  const [vector] = await testDb.insert(tenants).values({ name: "Vector", slug: "vector-cad" }).returning();
  const [atic] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-cad" }).returning();
  vectorTenant = vector.id;
  aticTenant = atic.id;

  const mkUser = async (tenantId: string, email: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name: email, role: "admin" })
      .returning();
    return u.id;
  };
  ana = await mkUser(vectorTenant, "ana@vector.md");
  borisAtic = await mkUser(aticTenant, "boris@atic.md");

  // Etapele: „Pierdut" e marcată prin FLAG, nu prin cheie — reactivarea se sprijină pe flag.
  for (const [tenantId, prefix] of [
    [vectorTenant, "v"],
    [aticTenant, "a"],
  ] as const) {
    await testDb.insert(crmPipelineStages).values([
      { tenantId, key: "new", label: "Nou", orderIndex: 0 },
      { tenantId, key: `${prefix}_renuntat`, label: "Renunțat", orderIndex: 1, isLost: true },
    ]);
  }

  session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Motorul cadențelor", () => {
  it("[blocant] pasul scadent se aprinde — creează taskul și îl programează pe următorul", async () => {
    const { processDueEnrollments } = await import("../lib/crm/cadences");
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };

    const created = await post("/api/crm/cadences", {
      name: "Urmărire ofertă",
      steps: [
        { dayOffset: 0, action: "task", title: "Sună clientul" },
        { dayOffset: 3, action: "note", title: "Verifică dacă a citit oferta" },
      ],
    });
    expect(created.status).toBe(201);

    const leadId = await mkLead(vectorTenant, "Client cu ofertă");
    const enrolled = await post("/api/crm/cadences/enroll", { leadId, cadenceId: created.body.id });
    expect(enrolled.status).toBe(201);

    const result = await processDueEnrollments(new Date(), vectorTenant);
    expect(result.advanced).toBe(1);

    const tasks = await testDb.select().from(crmLeadTasks).where(eq(crmLeadTasks.leadId, leadId));
    expect(tasks.map((t) => t.title)).toEqual(["Sună clientul"]);

    const [enrollment] = await testDb
      .select()
      .from(crmCadenceEnrollments)
      .where(eq(crmCadenceEnrollments.leadId, leadId));
    expect(enrollment.status).toBe("active");
    expect(enrollment.currentStep).toBe(1);
    // Pasul 2 e la +3 zile: nu se aprinde azi.
    expect(enrollment.nextFireAt!.getTime()).toBeGreaterThan(Date.now() + 2 * DAY);
  });

  it("[blocant] un pas care nu e încă scadent NU se aprinde", async () => {
    const { processDueEnrollments } = await import("../lib/crm/cadences");
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };

    const before = await testDb.select().from(leadInteractions);
    const result = await processDueEnrollments(new Date(), vectorTenant);

    expect(result.advanced).toBe(0);
    expect(await testDb.select().from(leadInteractions)).toHaveLength(before.length);
  });

  it("[blocant] peste 3 zile se aprinde pasul 2 (nota) și înscrierea se încheie", async () => {
    const { processDueEnrollments } = await import("../lib/crm/cadences");
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };

    const result = await processDueEnrollments(new Date(Date.now() + 4 * DAY), vectorTenant);
    expect(result.advanced).toBe(1);

    const notes = await testDb
      .select()
      .from(leadInteractions)
      .where(eq(leadInteractions.type, "note"));
    expect(notes.some((n) => n.body === "Verifică dacă a citit oferta")).toBe(true);

    const [enrollment] = await testDb.select().from(crmCadenceEnrollments);
    expect(enrollment.status).toBe("done");
    expect(enrollment.nextFireAt).toBeNull();
  });

  it("[blocant] cadențele altui workspace nu se văd și nu se pot folosi", async () => {
    session = { id: borisAtic, tenantId: aticTenant, role: "admin", email: "boris@atic.md" };
    const list = await app.request("/api/crm/cadences");
    expect(((await list.json()) as { items: unknown[] }).items).toHaveLength(0);

    const [vectorCadence] = await testDb.select().from(crmCadences).where(eq(crmCadences.tenantId, vectorTenant));
    const leadAtic = await mkLead(aticTenant, "Lead ATIC");
    const res = await post("/api/crm/cadences/enroll", { leadId: leadAtic, cadenceId: vectorCadence.id });
    expect(res.status).toBe(404); // cadență străină → 404, nu 403
  });

  it("[normal] o cadență fără pași se înscrie direct ca încheiată", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const created = await post("/api/crm/cadences", { name: "Goală", steps: [] });
    const leadId = await mkLead(vectorTenant, "Fără pași");

    const enrolled = await post("/api/crm/cadences/enroll", { leadId, cadenceId: created.body.id });
    expect(enrolled.body.status).toBe("done");
    expect(enrolled.body.nextFireAt).toBeNull();
  });
});

describe("Reactivarea clienților pierduți", () => {
  it("[blocant] un lead pierdut de 7 luni e scadent pentru o regulă la 6 luni; unul de 2 luni nu", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };

    const vechi = await mkLead(vectorTenant, "Pierdut demult", "v_renuntat");
    const recent = await mkLead(vectorTenant, "Pierdut recent", "v_renuntat");
    const sevenMonthsAgo = new Date();
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    // `lostAt` se derivă din cronologie, nu din `updated_at` — de-aici tranzițiile de mai jos.
    await testDb.insert(leadInteractions).values([
      { tenantId: vectorTenant, leadId: vechi, type: "stage_change", direction: "internal", body: "new → v_renuntat", metadata: { to: "v_renuntat" }, occurredAt: sevenMonthsAgo },
      { tenantId: vectorTenant, leadId: recent, type: "stage_change", direction: "internal", body: "new → v_renuntat", metadata: { to: "v_renuntat" }, occurredAt: twoMonthsAgo },
    ]);

    await post("/api/crm/cadences/reengagement/rules", {
      name: "Trezește la 6 luni",
      afterMonths: 6,
      action: "create_task",
      taskTitle: "Sună clientul pierdut",
    });

    const preview = await app.request("/api/crm/cadences/reengagement/preview");
    const items = ((await preview.json()) as { items: Array<{ leadId: string; leadName: string }> }).items;

    expect(items.map((i) => i.leadId)).toEqual([vechi]);
    expect(items[0].leadName).toBe("Pierdut demult");
  });

  it("[blocant] rularea aplică acțiunea o SINGURĂ dată, oricât de des ar rula cronul", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };

    const first = await post("/api/crm/cadences/reengagement/run");
    expect(first.body.applied).toBe(1);

    const [rule] = await testDb.select().from(crmReengagementRules).where(eq(crmReengagementRules.tenantId, vectorTenant));
    const runs = await testDb.select().from(crmReengagementRuns).where(eq(crmReengagementRuns.ruleId, rule.id));
    expect(runs).toHaveLength(1);

    // A doua rulare nu mai are ce trezi: unicitatea (regulă, lead) e regula de business.
    const second = await post("/api/crm/cadences/reengagement/run");
    expect(second.body.due).toBe(0);
    expect(second.body.applied).toBe(0);

    const tasks = await testDb
      .select()
      .from(crmLeadTasks)
      .where(and(eq(crmLeadTasks.tenantId, vectorTenant), eq(crmLeadTasks.title, "Sună clientul pierdut")));
    expect(tasks).toHaveLength(1);
  });

  it("[blocant] un lead readus în lucru nu mai e trezit — `lostAt` devine null", async () => {
    const { listLostLeads } = await import("../lib/crm/reengagement");
    const revenit = await mkLead(vectorTenant, "A revenit", "v_renuntat");
    const eightMonthsAgo = new Date();
    eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 8);
    await testDb.insert(leadInteractions).values({
      tenantId: vectorTenant,
      leadId: revenit,
      type: "stage_change",
      direction: "internal",
      body: "new → v_renuntat",
      metadata: { to: "v_renuntat" },
      occurredAt: eightMonthsAgo,
    });

    // Scos din etapa pierdută: e din nou în lucru.
    await testDb.update(leads).set({ stage: "new" }).where(eq(leads.id, revenit));

    const lost = await listLostLeads(vectorTenant);
    expect(lost.some((l) => l.id === revenit)).toBe(false);
  });

  it("[blocant] reactivarea nu trece granița workspace-ului", async () => {
    session = { id: borisAtic, tenantId: aticTenant, role: "admin", email: "boris@atic.md" };
    const preview = await app.request("/api/crm/cadences/reengagement/preview");
    expect(((await preview.json()) as { items: unknown[] }).items).toHaveLength(0);

    const rules = await app.request("/api/crm/cadences/reengagement/rules");
    expect(((await rules.json()) as { items: unknown[] }).items).toHaveLength(0);
  });

  it("[normal] acțiunea „add_tag” pune eticheta și nu crapă dacă există deja", async () => {
    session = { id: ana, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const lead = await mkLead(vectorTenant, "De etichetat", "v_renuntat");
    const yearAgo = new Date();
    yearAgo.setMonth(yearAgo.getMonth() - 12);
    await testDb.insert(leadInteractions).values({
      tenantId: vectorTenant,
      leadId: lead,
      type: "stage_change",
      direction: "internal",
      body: "new → v_renuntat",
      metadata: { to: "v_renuntat" },
      occurredAt: yearAgo,
    });
    await testDb.insert(leadTags).values({ tenantId: vectorTenant, leadId: lead, tag: "Reactivare" });

    await post("/api/crm/cadences/reengagement/rules", {
      name: "Etichetează la 9 luni",
      afterMonths: 9,
      action: "add_tag",
      taskTitle: "Reactivare",
    });

    const run = await post("/api/crm/cadences/reengagement/run");
    expect(run.body.failed).toBe(0);

    const tags = await testDb.select().from(leadTags).where(eq(leadTags.leadId, lead));
    expect(tags).toHaveLength(1); // nu s-a dublat
  });
});
