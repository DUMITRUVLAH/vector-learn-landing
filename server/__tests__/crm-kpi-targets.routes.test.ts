/**
 * @vitest-environment node
 *
 * CC-5 — normele de activitate și gradul de realizare.
 *
 * Ce apără testele:
 *  1. **fără normă nu există 0%** — un indicator pe care nimeni n-a cerut nimic n-are voie să
 *     apară ca ratat; altfel ecranul e roșu într-un workspace care doar n-a apucat să-și pună
 *     norme;
 *  2. **scalarea e explicită** — o normă săptămânală privită pe 30 de zile devine proporțională,
 *     nu rămâne 60 (ceea ce ar produce „428%" la orice raport lunar);
 *  3. **norma personală bate norma echipei**;
 *  4. **izolarea între workspace-uri** — normele nu se văd și nu se pun peste graniță;
 *  5. **0 șterge norma**, nu o salvează ca zero.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { crmKpiTargets } from "../db/schema/crmKpiTargets";
import { kpiAttainment, type SalesKpis, type KpiTargetRow } from "../lib/crm/reports";

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
let sefId: string;
let anaId: string;
let strainId: string;

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

async function put(body: unknown) {
  const res = await app.request("/api/crm/kpi-targets", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmKpiTargetsRoutes } = await import("../routes/crmKpiTargets");
  app = new Hono();
  app.route("/api/crm/kpi-targets", crmKpiTargetsRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "CallCo", slug: "callco-kpi" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Rival", slug: "rival-kpi" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;

  const mk = async (tenantId: string, email: string, name: string, role: string) => {
    const [u] = await testDb.insert(users).values({ tenantId, email, passwordHash: "x", name, role }).returning();
    return u.id;
  };
  sefId = await mk(tenantA, "sef@callco.md", "Șeful", "admin");
  anaId = await mk(tenantA, "ana@callco.md", "Ana Pop", "manager");
  strainId = await mk(tenantB, "vlad@rival.md", "Vlad", "manager");
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(crmKpiTargets);
  session = { id: sefId, tenantId: tenantA, role: "admin", email: "sef@callco.md" };
});

describe("Normele, în bază", () => {
  it("[blocant] norma generală se salvează o singură dată, chiar salvată de două ori", async () => {
    // Indexul unic pe (tenant, period, metric) e PARȚIAL — două rânduri cu user_id NULL nu se
    // ciocnesc într-un index obișnuit, deci norma echipei s-ar fi putut dubla în tăcere.
    await put({ metric: "callsMade", target: 60 });
    await put({ metric: "callsMade", target: 80 });

    const rows = await testDb.select().from(crmKpiTargets).where(eq(crmKpiTargets.tenantId, tenantA));
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toBe(80);
  });

  it("[blocant] 0 ȘTERGE norma — nu o salvează ca zero", async () => {
    await put({ metric: "callsMade", target: 60 });
    const res = await put({ metric: "callsMade", target: 0 });

    expect(res.body.removed).toBe(true);
    const rows = await testDb.select().from(crmKpiTargets).where(eq(crmKpiTargets.tenantId, tenantA));
    expect(rows).toHaveLength(0);
  });

  it("norma personală stă alături de cea generală, nu în locul ei", async () => {
    await put({ metric: "callsMade", target: 60 });
    await put({ metric: "callsMade", target: 90, userId: anaId });

    const rows = await testDb.select().from(crmKpiTargets).where(eq(crmKpiTargets.tenantId, tenantA));
    expect(rows).toHaveLength(2);
  });

  it("[blocant] nu se poate pune normă pe un om din alt workspace", async () => {
    const res = await put({ metric: "callsMade", target: 60, userId: strainId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unknown_member");
  });

  it("[blocant] normele unui workspace nu se văd din altul", async () => {
    await put({ metric: "callsMade", target: 60 });

    session = { id: strainId, tenantId: tenantB, role: "admin", email: "vlad@rival.md" };
    const res = await app.request("/api/crm/kpi-targets");
    expect(((await res.json()) as { items: unknown[] }).items).toHaveLength(0);
  });

  it("un indicator inventat e respins", async () => {
    const res = await put({ metric: "numarul_de_cafele", target: 3 });
    expect(res.status).toBe(400);
  });
});

// ─── Calculul pur al gradului de realizare ──────────────────────────────────

const KPIS: SalesKpis = {
  leadsAllocated: 120,
  callsMade: 43,
  successfulContacts: 12,
  meetings: 3,
  offersSent: 2,
  contractsSigned: 1,
  salesValueCents: 500_000,
  tasksDone: 8,
  tasksOverdue: 2,
};

const WEEK = { from: "2026-09-07T00:00:00.000Z", to: "2026-09-14T00:00:00.000Z" };

describe("Gradul de realizare", () => {
  it("[blocant] fără normă setată nu există grad de realizare — și deci nici 0%", () => {
    expect(kpiAttainment(KPIS, [], WEEK)).toEqual({});
  });

  it("[blocant] 43 din 60 înseamnă 72%", () => {
    const targets: KpiTargetRow[] = [{ userId: null, period: "week", metric: "callsMade", target: 60 }];
    const out = kpiAttainment(KPIS, targets, WEEK);
    expect(out.callsMade).toEqual({ target: 60, achieved: 43, pct: 72 });
  });

  it("[blocant] o normă săptămânală se scalează la perioada raportului", () => {
    // 60/săptămână, privit pe 28 de zile = 240. Fără scalare ar fi scris „72%" pe o lună întreagă.
    const targets: KpiTargetRow[] = [{ userId: null, period: "week", metric: "callsMade", target: 60 }];
    const out = kpiAttainment(KPIS, targets, {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-29T00:00:00.000Z",
    });
    expect(out.callsMade.target).toBe(240);
  });

  it("[blocant] „tot timpul” (perioadă fără capete) nu inventează o scalare", () => {
    const targets: KpiTargetRow[] = [{ userId: null, period: "week", metric: "callsMade", target: 60 }];
    expect(kpiAttainment(KPIS, targets, { from: null, to: null })).toEqual({});
  });

  it("[blocant] norma personală bate norma echipei", () => {
    const targets: KpiTargetRow[] = [
      { userId: null, period: "week", metric: "callsMade", target: 60 },
      { userId: "ana", period: "week", metric: "callsMade", target: 100 },
    ];
    expect(kpiAttainment(KPIS, targets, WEEK, "ana").callsMade.target).toBe(100);
    // Iar cineva fără normă proprie rămâne pe cea a echipei.
    expect(kpiAttainment(KPIS, targets, WEEK, "bo").callsMade.target).toBe(60);
  });

  it("depășirea normei NU se taie la 100% — „140%” e o informație", () => {
    const targets: KpiTargetRow[] = [{ userId: null, period: "week", metric: "meetings", target: 2 }];
    expect(kpiAttainment(KPIS, targets, WEEK).meetings.pct).toBe(150);
  });
});
