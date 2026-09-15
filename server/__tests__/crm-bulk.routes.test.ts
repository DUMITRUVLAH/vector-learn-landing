/**
 * @vitest-environment node
 * ACȚIUNI ÎN MASĂ PE LEADURI — INTEGRATION (cerințele 5–6 din caietul de sarcini).
 *
 * Repartizarea manuală și cea automată existau, dar lead cu lead. După segmentare (cerința 4)
 * asta devine absurd: filtrezi 60 de firme și le atribui din 60 de fișe deschise.
 *
 * Ce apără testele, în ordinea gravității a ceea ce ar strica:
 *  1. **izolarea între workspace-uri** — un id străin strecurat în listă nu se atinge, și se
 *     întoarce ca „not_found", nu ca 403 (un 403 ar confirma că leadul altcuiva există);
 *  2. **rezultatul parțial se raportează** — un „ok" peste 10 leaduri din care 3 n-au putut fi
 *     mutate e mai rău decât o eroare;
 *  3. **aceleași reguli ca la un singur lead** — etapa trebuie să existe în pâlnia leadului,
 *     „pierdut" cere motiv, fiecare mutare lasă urmă în cronologie;
 *  4. repartizarea automată nu rescrie munca nimănui: leadul deja atribuit e sărit, explicit.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq, inArray } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads, leadInteractions, leadTags } from "../db/schema/leads";
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
let tenantA: string;
let tenantB: string;
let userA: { id: string; tenantId: string; role: string; email: string };
let agentId: string;
let leadIds: string[] = [];
let leadStrain: string;
let leadB2B: string;

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

function bulk(body: unknown) {
  return app.request("/api/crm/leads/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmLeadsRoutes } = await import("../routes/crmLeads");
  app = new Hono();
  app.route("/api/crm/leads", crmLeadsRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-bulk" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Rival", slug: "rival-bulk" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;

  const [uA] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@eco.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  const [agent] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ion@eco.md", passwordHash: "x", name: "Ion", role: "manager" })
    .returning();
  userA = { id: uA.id, tenantId: tenantA, role: "admin", email: uA.email };
  agentId = agent.id;
  session = userA;

  // Două pâlnii: cea implicită („Vânzări") și una B2B cu alte chei de etapă. Mutarea în masă
  // trebuie să sară leadul B2B când cheia cerută nu există la el.
  const [vanzari] = await testDb
    .insert(crmPipelines)
    .values({ tenantId: tenantA, name: "Vânzări", orderIndex: 0, isDefault: true })
    .returning();
  const [b2b] = await testDb
    .insert(crmPipelines)
    .values({ tenantId: tenantA, name: "B2B", orderIndex: 1, isDefault: false })
    .returning();

  await testDb.insert(crmPipelineStages).values([
    { tenantId: tenantA, pipelineId: vanzari.id, key: "new", label: "Lead nou", orderIndex: 0 },
    { tenantId: tenantA, pipelineId: vanzari.id, key: "contacted", label: "Contactat", orderIndex: 1 },
    { tenantId: tenantA, pipelineId: vanzari.id, key: "pierdut", label: "Pierdut", orderIndex: 2, isLost: true },
    { tenantId: tenantA, pipelineId: b2b.id, key: "licitatie", label: "Licitație", orderIndex: 0 },
  ]);

  const created = await testDb
    .insert(leads)
    .values([
      { tenantId: tenantA, fullName: "Lead Unu", stage: "new", pipelineId: vanzari.id },
      { tenantId: tenantA, fullName: "Lead Doi", stage: "new", pipelineId: vanzari.id },
      { tenantId: tenantA, fullName: "Lead Trei", stage: "new", pipelineId: vanzari.id },
    ])
    .returning();
  leadIds = created.map((l) => l.id);

  const [b2bLead] = await testDb
    .insert(leads)
    .values({ tenantId: tenantA, fullName: "Lead B2B", stage: "licitatie", pipelineId: b2b.id })
    .returning();
  leadB2B = b2bLead.id;

  const [strain] = await testDb
    .insert(leads)
    .values({ tenantId: tenantB, fullName: "Lead Străin", stage: "new" })
    .returning();
  leadStrain = strain.id;
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(() => {
  session = userA;
});

describe("Acțiuni în masă — responsabil", () => {
  it("[blocant] atribuie toate leadurile selectate, dintr-o singură cerere", async () => {
    const res = await bulk({ leadIds, action: "assign", assignedTo: agentId });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(3);
    expect(body.skipped).toEqual([]);

    const rows = await testDb.select().from(leads).where(inArray(leads.id, leadIds));
    expect(rows.every((r) => r.assignedTo === agentId)).toBe(true);
  });

  it("[blocant] schimbarea lasă urmă în cronologia FIECĂRUI lead", async () => {
    const urme = await testDb
      .select()
      .from(leadInteractions)
      .where(and(eq(leadInteractions.tenantId, tenantA), eq(leadInteractions.leadId, leadIds[0])));
    expect(urme.some((u) => u.type === "system" && /Responsabil/.test(u.body ?? ""))).toBe(true);
  });

  it("[blocant] un lead al altui workspace nu se atinge — și se raportează ca „not_found”", async () => {
    const before = await testDb.select().from(leads).where(eq(leads.id, leadStrain));
    const body = await (await bulk({ leadIds: [leadIds[0], leadStrain], action: "assign", assignedTo: agentId })).json();

    expect(body.updated).toBe(1);
    expect(body.skipped).toEqual([{ leadId: leadStrain, reason: "not_found" }]);

    const after = await testDb.select().from(leads).where(eq(leads.id, leadStrain));
    expect(after[0].assignedTo).toBe(before[0].assignedTo);
  });

  it("[normal] „fără responsabil” chiar îl scoate", async () => {
    const body = await (await bulk({ leadIds: [leadIds[0]], action: "assign", assignedTo: null })).json();
    expect(body.updated).toBe(1);
    const [row] = await testDb.select().from(leads).where(eq(leads.id, leadIds[0]));
    expect(row.assignedTo).toBeNull();
  });
});

describe("Acțiuni în masă — etapă", () => {
  it("[blocant] mută leadurile și scrie schimbarea în cronologie", async () => {
    const body = await (await bulk({ leadIds: [leadIds[1]], action: "stage", stage: "contacted" })).json();
    expect(body.updated).toBe(1);

    const [row] = await testDb.select().from(leads).where(eq(leads.id, leadIds[1]));
    expect(row.stage).toBe("contacted");

    const urme = await testDb
      .select()
      .from(leadInteractions)
      .where(and(eq(leadInteractions.leadId, leadIds[1]), eq(leadInteractions.type, "stage_change")));
    expect(urme.length).toBeGreaterThan(0);
  });

  it("[blocant] leadul din altă pâlnie e SĂRIT, nu mutat pe o coloană inexistentă", async () => {
    const body = await (await bulk({ leadIds: [leadIds[2], leadB2B], action: "stage", stage: "contacted" })).json();

    expect(body.updated).toBe(1);
    expect(body.skipped).toEqual([{ leadId: leadB2B, reason: "unknown_stage" }]);

    const [b2b] = await testDb.select().from(leads).where(eq(leads.id, leadB2B));
    expect(b2b.stage).toBe("licitatie");
  });

  it("[blocant] „pierdut” fără motiv nu trece — nici în masă", async () => {
    const body = await (await bulk({ leadIds: [leadIds[0]], action: "stage", stage: "pierdut" })).json();
    expect(body.updated).toBe(0);
    expect(body.skipped).toEqual([{ leadId: leadIds[0], reason: "lost_reason_required" }]);

    const [row] = await testDb.select().from(leads).where(eq(leads.id, leadIds[0]));
    expect(row.stage).not.toBe("pierdut");
  });

  it("[blocant] cu motiv, pierderea se scrie pe fiecare lead", async () => {
    const body = await (
      await bulk({ leadIds: [leadIds[0]], action: "stage", stage: "pierdut", lostReason: "preț prea mare" })
    ).json();
    expect(body.updated).toBe(1);

    const [row] = await testDb.select().from(leads).where(eq(leads.id, leadIds[0]));
    expect(row.stage).toBe("pierdut");
    expect(row.lostReason).toBe("preț prea mare");
  });
});

describe("Acțiuni în masă — repartizare automată și etichete", () => {
  it("[blocant] repartizarea automată nu fură leadurile deja atribuite", async () => {
    // Lead Unu a rămas fără responsabil (testul „fără responsabil"), Lead Doi/Trei îl au pe Ion.
    const body = await (await bulk({ leadIds, action: "auto-assign" })).json();

    const motive = (body.skipped as { leadId: string; reason: string }[]).filter(
      (s) => s.reason === "already_assigned"
    );
    expect(motive.map((m) => m.leadId).sort()).toEqual([leadIds[1], leadIds[2]].sort());

    const [unu] = await testDb.select().from(leads).where(eq(leads.id, leadIds[0]));
    // Nu există reguli de repartizare în acest workspace → leadul rămâne neatribuit, iar
    // răspunsul o spune în loc să tacă.
    expect(unu.assignedTo).toBeNull();
    expect((body.skipped as { leadId: string; reason: string }[]).some((s) => s.reason === "no_rule_matched")).toBe(true);
  });

  it("[blocant] eticheta se adaugă o singură dată, oricâte rulări", async () => {
    const prima = await (await bulk({ leadIds: [leadIds[0], leadIds[1]], action: "tag", tag: "campanie-toamna" })).json();
    expect(prima.updated).toBe(2);

    const a_doua = await (await bulk({ leadIds: [leadIds[0], leadIds[1]], action: "tag", tag: "campanie-toamna" })).json();
    expect(a_doua.updated).toBe(0);
    expect(a_doua.skipped.every((s: { reason: string }) => s.reason === "already_tagged")).toBe(true);

    const rows = await testDb
      .select()
      .from(leadTags)
      .where(and(eq(leadTags.tenantId, tenantA), eq(leadTags.tag, "campanie-toamna")));
    expect(rows.length).toBe(2);
  });

  it("[normal] peste 100 de leaduri într-o cerere e refuzat, nu executat pe jumătate", async () => {
    const prea_multe = Array.from({ length: 101 }, () => leadIds[0]);
    const res = await bulk({ leadIds: prea_multe, action: "assign", assignedTo: agentId });
    expect(res.status).toBe(400);
  });

  it("[normal] o acțiune fără câmpul ei obligatoriu e refuzată de validare", async () => {
    expect((await bulk({ leadIds, action: "stage" })).status).toBe(400);
    expect((await bulk({ leadIds, action: "tag" })).status).toBe(400);
  });
});
