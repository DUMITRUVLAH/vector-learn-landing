/**
 * @vitest-environment node
 * PÂLNII MULTIPLE — INTEGRATION (rutele reale, PGlite, toate migrările).
 *
 * Portare din crm-vector (`src/lib/crm/pipelines.ts`): un workspace poate avea mai multe pâlnii,
 * fiecare cu etapele ei. Diferența față de referință e izolarea: acolo baza era single-tenant cu
 * RLS `USING(true)`, aici fiecare interogare trece prin `tenant_id` — deci primul test scris e
 * „un rând al unui workspace nu se vede din altul” (regula 3 din backlog/crm/PORT-DIN-CRM-VECTOR.md).
 *
 * Se testează ACȚIUNEA (endpointul e chiar apelat), nu forma unei funcții.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads, leadInteractions } from "../db/schema/leads";
import { crmPipelines } from "../db/schema/crmPipelines";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";

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
let anaVector: string;
let borisAtic: string;

interface PipelineRow {
  id: string;
  name: string;
  isDefault: boolean;
}

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

async function listPipelines(): Promise<{ status: number; items: PipelineRow[] }> {
  const res = await app.request("/api/crm/pipelines");
  const body = (await res.json()) as { items?: PipelineRow[] };
  return { status: res.status, items: body.items ?? [] };
}

async function createPipeline(
  name: string,
  template?: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.request("/api/crm/pipelines", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(template ? { name, template } : { name }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function kanban(pipelineId?: string): Promise<{ status: number; body: Record<string, never> }> {
  const res = await app.request(`/api/crm/leads/pipeline${pipelineId ? `?pipelineId=${pipelineId}` : ""}`);
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

async function mkLead(tenantId: string, fullName: string, pipelineId: string | null, stage: string) {
  const [row] = await testDb
    .insert(leads)
    .values({ tenantId, fullName, pipelineId, stage, source: "manual", valueCents: 10000 })
    .returning();
  return row.id;
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmPipelinesRoutes } = await import("../routes/crmPipelines");
  const { crmLeadsRoutes } = await import("../routes/crmLeads");
  const { crmStagesRoutes } = await import("../routes/crmStages");
  app = new Hono();
  app.route("/api/crm/pipelines", crmPipelinesRoutes);
  app.route("/api/crm/stages", crmStagesRoutes);
  app.route("/api/crm/leads", crmLeadsRoutes);

  const [vector] = await testDb.insert(tenants).values({ name: "Vector", slug: "vector-pipe" }).returning();
  const [atic] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-pipe" }).returning();
  vectorTenant = vector.id;
  aticTenant = atic.id;

  const mkUser = async (tenantId: string, email: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name: email, role: "admin" })
      .returning();
    return u.id;
  };
  anaVector = await mkUser(vectorTenant, "ana@vector.md");
  borisAtic = await mkUser(aticTenant, "boris@atic.md");

  session = { id: anaVector, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("GET /api/crm/pipelines — implicita apare singură", () => {
  it("[blocant] un workspace fără pâlnii primește „Vânzări” implicită, iar etapele orfane intră în ea", async () => {
    session = { id: anaVector, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    // Etapă rămasă fără pâlnie, exact ca rândurile de dinainte de migrarea 0166.
    await testDb.insert(crmPipelineStages).values({
      tenantId: vectorTenant,
      pipelineId: null,
      key: "new",
      label: "Lead nou",
      orderIndex: 0,
      isDefault: true,
    });

    const { status, items } = await listPipelines();

    expect(status).toBe(200);
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Vânzări");
    expect(items[0].isDefault).toBe(true);

    const orphans = await testDb
      .select()
      .from(crmPipelineStages)
      .where(and(eq(crmPipelineStages.tenantId, vectorTenant), eq(crmPipelineStages.key, "new")));
    expect(orphans[0].pipelineId).toBe(items[0].id); // adoptată, nu lăsată fără coloană
  });

  it("[blocant] pâlniile unui workspace NU se văd din altul", async () => {
    session = { id: borisAtic, tenantId: aticTenant, role: "admin", email: "boris@atic.md" };
    const { items } = await listPipelines();

    // ATIC își primește propria implicită; nu vede nimic din Vector.
    expect(items).toHaveLength(1);
    const vectorPipelines = await testDb
      .select()
      .from(crmPipelines)
      .where(eq(crmPipelines.tenantId, vectorTenant));
    expect(items.some((p) => vectorPipelines.some((v) => v.id === p.id))).toBe(false);
  });

  it("[blocant] redenumirea/ștergerea unei pâlnii din alt workspace → 404, nu 403", async () => {
    const [vectorDefault] = await testDb
      .select()
      .from(crmPipelines)
      .where(eq(crmPipelines.tenantId, vectorTenant));
    session = { id: borisAtic, tenantId: aticTenant, role: "admin", email: "boris@atic.md" };

    const patch = await app.request(`/api/crm/pipelines/${vectorDefault.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Furat" }),
    });
    expect(patch.status).toBe(404);

    const del = await app.request(`/api/crm/pipelines/${vectorDefault.id}`, { method: "DELETE" });
    expect(del.status).toBe(404);

    const [after] = await testDb
      .select()
      .from(crmPipelines)
      .where(eq(crmPipelines.id, vectorDefault.id));
    expect(after.name).toBe("Vânzări"); // neatinsă
  });
});

describe("POST /api/crm/pipelines — pâlnia nouă se naște cu etapele ei", () => {
  it("[blocant] „B2B” primește 5 etape proprii, iar cheia „new” poate exista în ambele pâlnii", async () => {
    session = { id: anaVector, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const { status, body } = await createPipeline("B2B");

    expect(status).toBe(201);
    const b2bId = body.id as string;

    const stages = await testDb
      .select()
      .from(crmPipelineStages)
      .where(and(eq(crmPipelineStages.tenantId, vectorTenant), eq(crmPipelineStages.pipelineId, b2bId)));
    expect(stages).toHaveLength(5);

    // Aceeași cheie în două pâlnii — motivul pentru care indexul unic s-a mutat pe (tenant, pâlnie, key).
    const allNew = await testDb
      .select()
      .from(crmPipelineStages)
      .where(and(eq(crmPipelineStages.tenantId, vectorTenant), eq(crmPipelineStages.key, "new")));
    expect(allNew.length).toBeGreaterThanOrEqual(2);
  });

  it("[blocant] șablonul SPANCO seamănă cele 7 etape ale lui, cu flagurile puse corect", async () => {
    session = { id: anaVector, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const { status, body } = await createPipeline("Vânzări B2B", "spanco");
    expect(status).toBe(201);

    const stages = await testDb
      .select()
      .from(crmPipelineStages)
      .where(and(eq(crmPipelineStages.tenantId, vectorTenant), eq(crmPipelineStages.pipelineId, body.id as string)))
      .orderBy(crmPipelineStages.orderIndex);

    expect(stages.map((s) => s.key)).toEqual([
      "suspect",
      "prospect",
      "analiza",
      "negociere",
      "concluzie",
      "comanda",
      "pierdut",
    ]);
    // Flagurile, nu etichetele, sunt ce citesc rapoartele: „contracte semnate” numără tranzițiile
    // către etapa marcată câștigată. Un flag pus greșit face raportul să mintă în tăcere.
    expect(stages.find((s) => s.key === "comanda")?.isWon).toBe(true);
    expect(stages.find((s) => s.key === "pierdut")?.isLost).toBe(true);
    expect(stages.filter((s) => s.isWon)).toHaveLength(1);
    expect(stages.filter((s) => s.isLost)).toHaveLength(1);
    // Probabilitățile cresc monoton — sunt punctul de plecare al prognozei.
    const open = stages.filter((s) => !s.isLost).map((s) => s.probabilityPct);
    expect([...open].sort((a, b) => a - b)).toEqual(open);
  });

  it("șablonul call-center are etapa „Decident atins”, cea care separă un apel de o discuție", async () => {
    session = { id: anaVector, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const { body } = await createPipeline("Outreach", "call_center");
    const stages = await testDb
      .select()
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.pipelineId, body.id as string));
    expect(stages.map((s) => s.key)).toContain("decident");
    expect(stages.map((s) => s.key)).toContain("rezerva");
  });

  it("un șablon inventat e respins, nu semănat pe tăcute cu altceva", async () => {
    session = { id: anaVector, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const { status } = await createPipeline("Ceva", "sablonul_meu");
    expect(status).toBe(400);
  });
});

describe("Kanbanul arată O pâlnie, nu toate leadurile amestecate", () => {
  it("[blocant] leadurile din „B2B” nu apar pe tabla pâlniei implicite (și invers)", async () => {
    session = { id: anaVector, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const pipelines = await testDb
      .select()
      .from(crmPipelines)
      .where(eq(crmPipelines.tenantId, vectorTenant));
    const def = pipelines.find((p) => p.isDefault)!;
    const b2b = pipelines.find((p) => p.name === "B2B")!;

    await mkLead(vectorTenant, "Retail Ion", def.id, "new");
    await mkLead(vectorTenant, "Corporate SRL", b2b.id, "new");
    // Lead vechi, fără pâlnie: trebuie citit ca fiind în implicită, fără să fie rescris.
    await mkLead(vectorTenant, "Lead vechi", null, "new");

    const onDefault = await kanban(def.id);
    const namesDefault = (onDefault.body.grouped as Record<string, Array<{ fullName: string }>>).new.map(
      (l) => l.fullName
    );
    expect(namesDefault).toContain("Retail Ion");
    expect(namesDefault).toContain("Lead vechi");
    expect(namesDefault).not.toContain("Corporate SRL");

    const onB2b = await kanban(b2b.id);
    const namesB2b = (onB2b.body.grouped as Record<string, Array<{ fullName: string }>>).new.map((l) => l.fullName);
    expect(namesB2b).toEqual(["Corporate SRL"]);
    expect((onB2b.body.counts as Record<string, number>).new).toBe(1);
  });

  it("[blocant] un pipelineId din alt workspace → 404, nu tabla proprie în tăcere", async () => {
    const [aticPipeline] = await testDb
      .select()
      .from(crmPipelines)
      .where(eq(crmPipelines.tenantId, aticTenant));
    session = { id: anaVector, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };

    const res = await kanban(aticPipeline.id);
    expect(res.status).toBe(404);
  });
});

describe("Mutările respectă pâlnia leadului", () => {
  it("[blocant] o etapă din ALTĂ pâlnie e refuzată cu unknown_stage", async () => {
    session = { id: anaVector, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const pipelines = await testDb.select().from(crmPipelines).where(eq(crmPipelines.tenantId, vectorTenant));
    const def = pipelines.find((p) => p.isDefault)!;
    const b2b = pipelines.find((p) => p.name === "B2B")!;

    // Etapă proprie doar pâlniei B2B.
    await testDb.insert(crmPipelineStages).values({
      tenantId: vectorTenant,
      pipelineId: b2b.id,
      key: "negociere_b2b",
      label: "Negociere",
      orderIndex: 9,
    });

    const leadId = await mkLead(vectorTenant, "Retail Maria", def.id, "new");
    const res = await app.request(`/api/crm/leads/${leadId}/stage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "negociere_b2b" }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_stage");

    const [after] = await testDb.select().from(leads).where(eq(leads.id, leadId));
    expect(after.stage).toBe("new"); // neatins
  });

  it("[blocant] mutarea în altă pâlnie reașază etapa și lasă urmă în istoric", async () => {
    session = { id: anaVector, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const pipelines = await testDb.select().from(crmPipelines).where(eq(crmPipelines.tenantId, vectorTenant));
    const def = pipelines.find((p) => p.isDefault)!;
    const b2b = pipelines.find((p) => p.name === "B2B")!;

    const leadId = await mkLead(vectorTenant, "Trece la B2B", def.id, "trial");
    const res = await app.request(`/api/crm/leads/${leadId}/pipeline`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pipelineId: b2b.id }),
    });

    expect(res.status).toBe(200);
    const [after] = await testDb.select().from(leads).where(eq(leads.id, leadId));
    expect(after.pipelineId).toBe(b2b.id);
    // Prima etapă a pâlniei țintă — nu rămâne cu o cheie fără coloană acolo.
    expect(after.stage).toBe("new");

    const history = await testDb
      .select()
      .from(leadInteractions)
      .where(eq(leadInteractions.leadId, leadId));
    expect(history.some((h) => (h.body ?? "").includes("B2B"))).toBe(true);
  });
});

describe("Ștergerea unei pâlnii", () => {
  it("[blocant] implicita nu se poate șterge, iar una cu leaduri cere mutarea lor întâi", async () => {
    session = { id: anaVector, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const pipelines = await testDb.select().from(crmPipelines).where(eq(crmPipelines.tenantId, vectorTenant));
    const def = pipelines.find((p) => p.isDefault)!;
    const b2b = pipelines.find((p) => p.name === "B2B")!;

    const onDefault = await app.request(`/api/crm/pipelines/${def.id}`, { method: "DELETE" });
    expect(onDefault.status).toBe(400);
    expect((await onDefault.json()).error).toBe("pipeline_is_default");

    const withLeads = await app.request(`/api/crm/pipelines/${b2b.id}`, { method: "DELETE" });
    expect(withLeads.status).toBe(409);
    expect((await withLeads.json()).error).toBe("pipeline_not_empty");
  });

  it("[normal] o pâlnie goală se șterge, cu etapele ei", async () => {
    session = { id: anaVector, tenantId: vectorTenant, role: "admin", email: "ana@vector.md" };
    const created = await createPipeline("De probă");
    const id = created.body.id as string;

    const res = await app.request(`/api/crm/pipelines/${id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const stages = await testDb
      .select()
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.pipelineId, id));
    expect(stages).toHaveLength(0);
  });
});
