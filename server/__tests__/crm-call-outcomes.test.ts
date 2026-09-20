/**
 * @vitest-environment node
 *
 * CC-6 — rezultatul apelului, cu vocabular închis, și contorul de încercări.
 *
 * Bug-ul de la care pornește tot: butonul „Am sunat" nu scria niciun `outcome`, iar raportul
 * căuta exact `outcome === "answered"` — deci „contacte reușite" era 0 la toată lumea, mereu,
 * fără ca nimic să pară stricat. Testele de mai jos fixează:
 *
 *  1. un rezultat necunoscut e RESPINS (altfel „nu raspunde", „N/A" și „nu a răspuns" devin trei
 *     rezultate diferite în raport);
 *  2. contorul de încercări crește la fiecare apel — DAR nu la rezultatele terminale, ca o regulă
 *     „după 5 încercări renunțăm" să nu se consume pe un număr greșit;
 *  3. contactabilitatea se calculează pe firme, nu doar pe apeluri;
 *  4. apelurile vechi, fără rezultat notat, se spun pe față ca „necunoscut" — nu se împart tăcut
 *     peste celelalte, ceea ce ar înrăutăți fals statistica listelor vechi.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads } from "../db/schema/leads";
import { crmPipelines } from "../db/schema/crmPipelines";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { callFunnel } from "../lib/crm/callOutcomes";

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
let anaId: string;
let leadId: string;

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

async function logCall(outcome?: string) {
  const res = await app.request(`/api/crm/leads/${leadId}/interactions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "call", direction: "outbound", ...(outcome ? { metadata: { outcome } } : {}) }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function readLead() {
  const [row] = await testDb.select().from(leads).where(eq(leads.id, leadId));
  return row;
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmLeadsRoutes } = await import("../routes/crmLeads");
  app = new Hono();
  app.route("/api/crm/leads", crmLeadsRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "CallCo", slug: "callco-outcome" }).returning();
  tenantA = tA.id;
  const [ana] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@callco.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  anaId = ana.id;

  const [pipeline] = await testDb
    .insert(crmPipelines)
    .values({ tenantId: tenantA, name: "Outreach", orderIndex: 0, isDefault: true })
    .returning();
  await testDb
    .insert(crmPipelineStages)
    .values({ tenantId: tenantA, pipelineId: pipeline.id, key: "new", label: "Nou", orderIndex: 0 });

  session = { id: anaId, tenantId: tenantA, role: "admin", email: "ana@callco.md" };
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(leads);
  const [row] = await testDb
    .insert(leads)
    .values({ tenantId: tenantA, fullName: "SRL Alfa", phone: "069391979", stage: "new", source: "import" })
    .returning();
  leadId = row.id;
});

describe("Rezultatul apelului se notează pe lead", () => {
  it("[blocant] un rezultat necunoscut e respins, nu salvat ca text liber", async () => {
    const res = await logCall("nu_a_raspuns_cred");
    expect(res.status).toBe(400);
  });

  it("[blocant] apelul crește contorul de încercări și își lasă rezultatul pe lead", async () => {
    await logCall("no_answer");
    let row = await readLead();
    expect(row.callAttempts).toBe(1);
    expect(row.lastCallOutcome).toBe("no_answer");
    expect(row.lastCallAt).not.toBeNull();

    await logCall("gatekeeper");
    row = await readLead();
    expect(row.callAttempts).toBe(2);
    expect(row.lastCallOutcome).toBe("gatekeeper");
  });

  it("[blocant] „număr greșit” NU consumă o încercare", async () => {
    // O regulă „după 5 încercări renunțăm" care se consumă pe un număr greșit lasă firma
    // nesunată cu adevărat — și scoasă din listă ca și cum ar fi refuzat.
    await logCall("no_answer");
    await logCall("wrong_number");
    const row = await readLead();
    expect(row.callAttempts).toBe(1);
    expect(row.lastCallOutcome).toBe("wrong_number");
  });

  it("un apel fără rezultat rămâne posibil (compatibilitate), dar se vede ca necunoscut", async () => {
    const res = await logCall();
    expect(res.status).toBe(201);
    const row = await readLead();
    expect(row.callAttempts).toBe(1);
    expect(row.lastCallOutcome).toBeNull();
  });
});

describe("Contactabilitatea listei", () => {
  it("[blocant] apeluri → răspunsuri → decidenți, pe firme distincte", () => {
    const out = callFunnel([
      { leadId: "a", outcome: "no_answer" },
      { leadId: "a", outcome: "gatekeeper" },
      { leadId: "a", outcome: "answered" },
      { leadId: "b", outcome: "no_answer" },
      { leadId: "c", outcome: "answered" },
    ]);

    expect(out.dialed).toBe(5);
    expect(out.connected).toBe(3); // gatekeeper + 2 answered
    expect(out.decisionMakers).toBe(2);
    expect(out.leadsTouched).toBe(3);
    expect(out.callsPerDecisionMaker).toBe(2.5);
  });

  it("[blocant] apelurile fără rezultat notat se raportează SEPARAT, nu ca eșecuri", () => {
    const out = callFunnel([
      { leadId: "a", outcome: null },
      { leadId: "b", outcome: "answered" },
    ]);
    expect(out.unknown).toBe(1);
    expect(out.connected).toBe(1);
    // Și nu apar ca „nu răspunde" în repartiție.
    expect(out.byOutcome.find((r) => r.outcome === "no_answer")).toBeUndefined();
  });

  it("fără niciun decident atins, media nu e 0 și nici Infinity — e „încă nu se știe”", () => {
    const out = callFunnel([{ leadId: "a", outcome: "no_answer" }]);
    expect(out.callsPerDecisionMaker).toBeNull();
  });

  it("o listă nesunată nu produce împărțiri la zero", () => {
    const out = callFunnel([]);
    expect(out).toMatchObject({ dialed: 0, connected: 0, decisionMakers: 0, leadsTouched: 0 });
    expect(out.byOutcome).toEqual([]);
  });
});
