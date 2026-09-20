/**
 * @vitest-environment node
 *
 * REPARTIZAREA PE LOTURI — „200 lui Ana, 200 lui Bo, restul rămân reci".
 *
 * Operațiunea asta atinge mii de rânduri într-o singură apăsare, pe baza de clienți a unei firme.
 * Ce apără testele, în ordinea gravității a ceea ce ar strica:
 *
 *  1. **izolarea între workspace-uri** — un id de utilizator străin nu primește NIMIC, iar
 *     cererea e oprită înainte de orice scriere (o repartizare pe jumătate e mai rea decât una
 *     refuzată);
 *  2. **numărul promis = numărul scris** — previzualizarea și execuția rulează aceeași funcție;
 *  3. **ordinea e stabilă** — cele mai vechi întâi, ca două rulări identice să dea același
 *     rezultat și o greșeală să poată fi refăcută;
 *  4. **nu se împart afaceri închise și nici munca altuia** — clienții existenți și lead-urile
 *     deja repartizate rămân neatinse;
 *  5. **segmentul chiar taie baza** — inclusiv după etichete și coloane importate, altfel
 *     filtrarea ar fi decorativă și lotul ar conține altceva decât a cerut omul.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq, isNull } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads, leadInteractions, leadTags, customFields, leadFieldValues } from "../db/schema/leads";
import { crmPipelines } from "../db/schema/crmPipelines";
import { crmCompanies } from "../db/schema/crmCompanies";
import { crmSalesSettings, crmAssignmentRules } from "../db/schema/crmAutomations";
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
let managerId: string;
let anaId: string;
let boId: string;
let strainId: string;
let pipelineId: string;

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

async function call(path: string, body: unknown) {
  const res = await app.request(`/api/crm/distribution${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

type Alloc = { userId: string; name: string; requested: number; given: number };

/** Inserează `n` lead-uri în etapa cerută, cu vechimi crescătoare (primul = cel mai vechi). */
async function seedLeads(n: number, opts: { stage?: string; assignedTo?: string | null; prefix?: string } = {}) {
  const base = new Date("2026-01-01T08:00:00Z").getTime();
  const rows = Array.from({ length: n }, (_, i) => ({
    tenantId: tenantA,
    pipelineId,
    fullName: `${opts.prefix ?? "Firma"} ${String(i + 1).padStart(3, "0")}`,
    phone: `0690000${String(i).padStart(3, "0")}`,
    stage: opts.stage ?? "new",
    source: "import" as const,
    assignedTo: opts.assignedTo ?? null,
    createdAt: new Date(base + i * 60_000),
  }));
  return testDb.insert(leads).values(rows).returning({ id: leads.id, fullName: leads.fullName });
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmDistributionRoutes } = await import("../routes/crmDistribution");
  app = new Hono();
  app.route("/api/crm/distribution", crmDistributionRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "CallCo", slug: "callco-dist" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Rival", slug: "rival-dist" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;

  const mk = async (tenantId: string, email: string, name: string, role: string) => {
    const [u] = await testDb.insert(users).values({ tenantId, email, passwordHash: "x", name, role }).returning();
    return u.id;
  };
  managerId = await mk(tenantA, "sef@callco.md", "Șeful", "admin");
  anaId = await mk(tenantA, "ana@callco.md", "Ana Pop", "manager");
  boId = await mk(tenantA, "bo@callco.md", "Bo Rusu", "manager");
  strainId = await mk(tenantB, "vlad@rival.md", "Vlad Străin", "manager");

  const [pipeline] = await testDb
    .insert(crmPipelines)
    .values({ tenantId: tenantA, name: "Outreach", orderIndex: 0, isDefault: true })
    .returning();
  pipelineId = pipeline.id;

  await testDb.insert(crmPipelineStages).values([
    { tenantId: tenantA, pipelineId, key: "new", label: "Rezervă rece", orderIndex: 0, probabilityPct: 5 },
    { tenantId: tenantA, pipelineId, key: "contract", label: "Contract", orderIndex: 1, isWon: true, probabilityPct: 100 },
    { tenantId: tenantA, pipelineId, key: "pierdut", label: "Pierdut", orderIndex: 2, isLost: true, probabilityPct: 0 },
  ]);
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(crmAssignmentRules);
  await testDb.delete(crmSalesSettings);
  await testDb.delete(leadFieldValues);
  await testDb.delete(leadTags);
  await testDb.delete(customFields);
  await testDb.delete(leadInteractions);
  await testDb.delete(leads);
  await testDb.delete(crmCompanies);
  session = { id: managerId, tenantId: tenantA, role: "admin", email: "sef@callco.md" };
});

describe("Lotul: câte a cerut fiecare, atâtea primește", () => {
  it("[blocant] 10 contacte se împart 4 / 3, iar restul rămân în rezervă", async () => {
    await seedLeads(10);

    const res = await call("/run", {
      allocations: [
        { userId: anaId, count: 4 },
        { userId: boId, count: 3 },
      ],
    });

    expect(res.status).toBe(200);
    const allocations = res.body.allocations as Alloc[];
    expect(allocations.map((a) => a.given)).toEqual([4, 3]);
    expect(res.body.remaining).toBe(3);
    expect(res.body.shortfall).toBe(0);

    const ale_anei = await testDb.select().from(leads).where(eq(leads.assignedTo, anaId));
    const ale_lui_bo = await testDb.select().from(leads).where(eq(leads.assignedTo, boId));
    const rezerva = await testDb
      .select()
      .from(leads)
      .where(and(eq(leads.tenantId, tenantA), isNull(leads.assignedTo)));
    expect(ale_anei).toHaveLength(4);
    expect(ale_lui_bo).toHaveLength(3);
    expect(rezerva).toHaveLength(3);
  });

  it("[blocant] se iau cele mai VECHI întâi — două rulări identice dau același rezultat", async () => {
    const seeded = await seedLeads(6);

    await call("/run", { allocations: [{ userId: anaId, count: 3 }] });
    const ale_anei = await testDb.select().from(leads).where(eq(leads.assignedTo, anaId));
    expect(ale_anei.map((l) => l.fullName).sort()).toEqual(
      seeded.slice(0, 3).map((l) => l.fullName).sort()
    );
  });

  it("[blocant] când baza se termină, se spune cât NU s-a dat — nu se raportează succes complet", async () => {
    await seedLeads(5);

    const res = await call("/run", {
      allocations: [
        { userId: anaId, count: 4 },
        { userId: boId, count: 4 },
      ],
    });

    const allocations = res.body.allocations as Alloc[];
    expect(allocations[0].given).toBe(4);
    expect(allocations[1].given).toBe(1); // atât a mai rămas
    expect(res.body.shortfall).toBe(3);
    expect(res.body.remaining).toBe(0);
  });

  it("[blocant] previzualizarea NU scrie nimic, dar promite exact cât se va scrie", async () => {
    await seedLeads(10);

    const prev = await call("/preview", { allocations: [{ userId: anaId, count: 6 }] });
    expect((prev.body.allocations as Alloc[])[0].given).toBe(6);
    expect(prev.body.available).toBe(10);

    const atinse = await testDb.select().from(leads).where(eq(leads.assignedTo, anaId));
    expect(atinse).toHaveLength(0);

    const run = await call("/run", { allocations: [{ userId: anaId, count: 6 }] });
    expect((run.body.allocations as Alloc[])[0].given).toBe(6);
  });
});

describe("Ce NU intră în lot", () => {
  it("[blocant] afacerile închise (câștigate sau pierdute) nu se repartizează", async () => {
    await seedLeads(2, { stage: "new" });
    await seedLeads(3, { stage: "contract", prefix: "Client" });
    await seedLeads(2, { stage: "pierdut", prefix: "Ratat" });

    const res = await call("/preview", { allocations: [{ userId: anaId, count: 100 }] });
    expect(res.body.available).toBe(2);
  });

  it("[blocant] lead-urile deja repartizate rămân ale omului lor", async () => {
    await seedLeads(3, { assignedTo: boId, prefix: "AleLuiBo" });
    await seedLeads(2, { prefix: "Libere" });

    const res = await call("/run", { allocations: [{ userId: anaId, count: 10 }] });
    expect((res.body.allocations as Alloc[])[0].given).toBe(2);

    const ale_lui_bo = await testDb.select().from(leads).where(eq(leads.assignedTo, boId));
    expect(ale_lui_bo).toHaveLength(3);
  });

  it("redistribuirea celor atribuiți se poate cere EXPLICIT (a plecat un om din echipă)", async () => {
    await seedLeads(3, { assignedTo: boId, prefix: "AleLuiBo" });

    const res = await call("/run", {
      onlyUnassigned: false,
      allocations: [{ userId: anaId, count: 3 }],
    });
    expect((res.body.allocations as Alloc[])[0].given).toBe(3);
    const ale_lui_bo = await testDb.select().from(leads).where(eq(leads.assignedTo, boId));
    expect(ale_lui_bo).toHaveLength(0);
  });
});

describe("Izolarea între workspace-uri", () => {
  it("[blocant] un utilizator din alt workspace e refuzat ÎNAINTE de orice scriere", async () => {
    await seedLeads(5);

    const res = await call("/run", {
      allocations: [
        { userId: anaId, count: 2 },
        { userId: strainId, count: 2 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unknown_members");

    // Nimic nu s-a repartizat: nici măcar partea „validă" a cererii.
    const atinse = await testDb.select().from(leads).where(eq(leads.assignedTo, anaId));
    expect(atinse).toHaveLength(0);
  });

  it("[blocant] lead-urile altui workspace nu intră niciodată în lot", async () => {
    await seedLeads(2);
    await testDb.insert(leads).values({
      tenantId: tenantB,
      fullName: "Firma Rivalului",
      phone: "069999999",
      stage: "new",
      source: "import",
    });

    const res = await call("/preview", { allocations: [{ userId: anaId, count: 100 }] });
    expect(res.body.available).toBe(2);
  });
});

describe("Segmentul chiar taie baza", () => {
  it("[blocant] filtrul pe etichetă limitează lotul la firmele etichetate", async () => {
    const seeded = await seedLeads(6);
    await testDb.insert(leadTags).values(
      seeded.slice(0, 2).map((l) => ({ tenantId: tenantA, leadId: l.id, tag: "alimentar" }))
    );

    const res = await call("/preview", {
      filters: { tag: "alimentar" },
      allocations: [{ userId: anaId, count: 100 }],
    });
    expect(res.body.available).toBe(2);
  });

  it("[blocant] filtrul pe o coloană IMPORTATĂ (câmp personalizat) limitează lotul", async () => {
    // Exact cerința: import un Excel cu „Cod CAEN", apoi dau agentului DOAR retailul alimentar.
    const seeded = await seedLeads(5);
    const [camp] = await testDb
      .insert(customFields)
      .values({ tenantId: tenantA, key: "cod_caen", label: "Cod CAEN" })
      .returning();
    await testDb.insert(leadFieldValues).values([
      { tenantId: tenantA, leadId: seeded[0].id, fieldId: camp.id, value: "4711" },
      { tenantId: tenantA, leadId: seeded[1].id, fieldId: camp.id, value: "4711" },
      { tenantId: tenantA, leadId: seeded[2].id, fieldId: camp.id, value: "5610" },
    ]);

    const res = await call("/run", {
      filters: { cf_cod_caen: "4711" },
      allocations: [{ userId: anaId, count: 100 }],
    });
    expect((res.body.allocations as Alloc[])[0].given).toBe(2);
  });

  it("un lead cu DOUĂ etichete se numără o singură dată", async () => {
    // Cu un JOIN în loc de subinterogare, ecranul ar promite 4 contacte acolo unde sunt 2.
    const seeded = await seedLeads(2);
    await testDb.insert(leadTags).values([
      { tenantId: tenantA, leadId: seeded[0].id, tag: "alimentar" },
      { tenantId: tenantA, leadId: seeded[0].id, tag: "retail" },
      { tenantId: tenantA, leadId: seeded[1].id, tag: "alimentar" },
    ]);

    const res = await call("/preview", {
      filters: { tag: "alimentar" },
      allocations: [{ userId: anaId, count: 100 }],
    });
    expect(res.body.available).toBe(2);
  });
});

describe("Urma lăsată", () => {
  it("[blocant] fiecare lead primit are o linie în cronologie, cu numele celui care l-a primit", async () => {
    await seedLeads(3);
    await call("/run", { allocations: [{ userId: anaId, count: 3 }] });

    const urme = await testDb.select().from(leadInteractions).where(eq(leadInteractions.tenantId, tenantA));
    expect(urme).toHaveLength(3);
    expect(urme[0].type).toBe("system");
    expect(urme[0].body).toContain("Ana Pop");
  });

  it("rezerva se poate număra fără să se repartizeze nimic", async () => {
    await seedLeads(4);
    await seedLeads(2, { assignedTo: anaId, prefix: "Date" });

    const res = await app.request("/api/crm/distribution/pool");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { pool: number }).pool).toBe(4);
  });
});

// ─── Repartizarea AUTOMATĂ (mod „auto") ─────────────────────────────────────

describe("Împarte sistemul, nu omul", () => {
  it("[blocant] „egal, pe rând” — 10 contacte între 2 agenți = 5 și 5", async () => {
    await seedLeads(10);

    const res = await call("/run", {
      mode: "auto",
      strategy: "round_robin",
      userIds: [anaId, boId],
    });

    const allocations = res.body.allocations as Alloc[];
    expect(allocations.map((a) => a.given).sort()).toEqual([5, 5]);
    expect(res.body.remaining).toBe(0);
  });

  it("[blocant] restul de la împărțire nu se pierde: 7 între 2 = 4 + 3", async () => {
    await seedLeads(7);
    const res = await call("/run", { mode: "auto", userIds: [anaId, boId] });
    const given = (res.body.allocations as Alloc[]).map((a) => a.given).sort((x, y) => y - x);
    expect(given).toEqual([4, 3]);
    expect(given[0] + given[1]).toBe(7);
  });

  it("se poate cere doar o parte din segment", async () => {
    await seedLeads(20);
    const res = await call("/run", { mode: "auto", userIds: [anaId, boId], count: 6 });
    expect((res.body.allocations as Alloc[]).map((a) => a.given).sort()).toEqual([3, 3]);
    expect(res.body.remaining).toBe(14);
  });

  it("[blocant] „după capacitate” — cine și-a atins norma zilnică nu mai primește", async () => {
    // Ana are normă 3/zi, Bogdan 20. Din 10 contacte, Ana ia 3, Bogdan restul.
    await testDb.insert(crmSalesSettings).values([
      { tenantId: tenantA, userId: anaId, dailyCapacity: 3, weight: 1, orderIndex: 0 },
      { tenantId: tenantA, userId: boId, dailyCapacity: 20, weight: 1, orderIndex: 1 },
    ]);
    await seedLeads(10);

    const res = await call("/run", { mode: "auto", strategy: "capacity", userIds: [anaId, boId] });
    const byUser = Object.fromEntries((res.body.allocations as Alloc[]).map((a) => [a.userId, a.given]));
    expect(byUser[anaId]).toBe(3);
    expect(byUser[boId]).toBe(7);
  });

  it("[blocant] „ponderat” — greutatea 2 primește dublu față de greutatea 1", async () => {
    await testDb.insert(crmSalesSettings).values([
      { tenantId: tenantA, userId: anaId, dailyCapacity: 0, weight: 2, orderIndex: 0 },
      { tenantId: tenantA, userId: boId, dailyCapacity: 0, weight: 1, orderIndex: 1 },
    ]);
    await seedLeads(9);

    const res = await call("/run", { mode: "auto", strategy: "weighted", userIds: [anaId, boId] });
    const byUser = Object.fromEntries((res.body.allocations as Alloc[]).map((a) => [a.userId, a.given]));
    expect(byUser[anaId]).toBe(6);
    expect(byUser[boId]).toBe(3);
  });

  it("[blocant] „după reguli” — teritoriul trimite leadul la agentul zonei", async () => {
    // Ana acoperă Nordul, Bogdan Sudul. Două firme, două regiuni, fiecare la omul ei.
    const [nord] = await testDb
      .insert(crmCompanies)
      .values({ tenantId: tenantA, name: "Firma Nord", region: "Nord" })
      .returning();
    const [sud] = await testDb
      .insert(crmCompanies)
      .values({ tenantId: tenantA, name: "Firma Sud", region: "Sud" })
      .returning();
    await testDb.insert(crmSalesSettings).values([
      { tenantId: tenantA, userId: anaId, dailyCapacity: 20, weight: 1, orderIndex: 0, regions: ["Nord"] },
      { tenantId: tenantA, userId: boId, dailyCapacity: 20, weight: 1, orderIndex: 1, regions: ["Sud"] },
    ]);
    await testDb.insert(crmAssignmentRules).values({
      tenantId: tenantA,
      name: "Teritoriu",
      enabled: true,
      strategy: "territory",
      conditions: [],
      userIds: [],
      orderIndex: 0,
    });

    const base = new Date("2026-01-01T08:00:00Z");
    await testDb.insert(leads).values([
      { tenantId: tenantA, pipelineId, fullName: "Nordica", phone: "069111111", stage: "new", source: "import", companyId: nord.id, createdAt: base },
      { tenantId: tenantA, pipelineId, fullName: "Sudica", phone: "069222222", stage: "new", source: "import", companyId: sud.id, createdAt: new Date(base.getTime() + 60000) },
    ]);

    const res = await call("/run", { mode: "auto", strategy: "rules", userIds: [anaId, boId] });
    const byUser = Object.fromEntries((res.body.allocations as Alloc[]).map((a) => [a.userId, a.given]));
    expect(byUser[anaId]).toBe(1);
    expect(byUser[boId]).toBe(1);

    const [nordica] = await testDb.select().from(leads).where(eq(leads.fullName, "Nordica"));
    expect(nordica.assignedTo).toBe(anaId);
  });

  it("[blocant] fără nicio regulă activă, „după reguli” nu mută nimic — și o spune", async () => {
    await seedLeads(5);
    const res = await call("/run", { mode: "auto", strategy: "rules", userIds: [anaId, boId] });
    expect((res.body.allocations as Alloc[]).every((a) => a.given === 0)).toBe(true);
    expect(res.body.remaining).toBe(5);

    const atinse = await testDb.select().from(leads).where(isNull(leads.assignedTo));
    expect(atinse).toHaveLength(5);
  });

  it("[blocant] modul automat fără niciun agent bifat e respins, nu „reușit cu 0”", async () => {
    await seedLeads(5);
    const res = await call("/run", { mode: "auto", userIds: [] });
    expect(res.status).toBe(400);
  });

  it("previzualizarea automată nu scrie nimic", async () => {
    await seedLeads(8);
    const res = await call("/preview", { mode: "auto", userIds: [anaId, boId] });
    expect((res.body.allocations as Alloc[]).map((a) => a.given).sort()).toEqual([4, 4]);
    const atinse = await testDb.select().from(leads).where(isNull(leads.assignedTo));
    expect(atinse).toHaveLength(8);
  });
});
