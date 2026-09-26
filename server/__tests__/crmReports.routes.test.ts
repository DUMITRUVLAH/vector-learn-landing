/**
 * @vitest-environment node
 *
 * Rapoartele CRM, portate din crm-vector. Testele verifică exact lucrurile pe
 * care portarea le putea strica:
 *   · izolarea pe workspace — aici nu există RLS, deci un filtru uitat înseamnă
 *     că un client vede cifrele altuia;
 *   · faptul că won/lost se derivă din flagurile etapei, nu dintr-o cheie fixă
 *     (etapele sunt redenumibile, iar un raport care caută „paid" se rupe mut);
 *   · că durata ciclului ignoră afacerile încă deschise.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, leads, leadInteractions } from "../db/schema";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { crmPipelines } from "../db/schema/crmPipelines";
import { crmLeadTasks } from "../db/schema/crmTasks";
import { crmCompanies } from "../db/schema/crmCompanies";
import { customFields, leadFieldValues } from "../db/schema/leads";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let tenantB: string;
let userA: string;
let userB: string;
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

/** Etapele implicite ale unui workspace, cu etichete ALESE DE EL. */
async function seedStages(tenantId: string, wonLabel = "Client", lostLabel = "Pierdut") {
  await testDb.insert(crmPipelineStages).values([
    { tenantId, key: "new", label: "Lead nou", orderIndex: 0, probabilityPct: 10 },
    { tenantId, key: "contacted", label: "Contactat", orderIndex: 1, probabilityPct: 25 },
    { tenantId, key: "castigat", label: wonLabel, orderIndex: 2, isWon: true, probabilityPct: 100 },
    { tenantId, key: "refuzat", label: lostLabel, orderIndex: 3, isLost: true, probabilityPct: 0 },
  ]);
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmReportsRoutes } = await import("../routes/crmReports");
  app = new Hono();
  app.route("/api/crm/reports", crmReportsRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Alfa", slug: "alfa-rap" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Beta", slug: "beta-rap" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;

  const [uA] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@alfa.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  const [uB] = await testDb
    .insert(users)
    .values({ tenantId: tenantB, email: "bogdan@beta.md", passwordHash: "x", name: "Bogdan", role: "admin" })
    .returning();
  userA = uA.id;
  userB = uB.id;

  await seedStages(tenantA);
  // Workspace-ul B își numește etapele ALTFEL — exact capcana pe care rapoartele
  // trebuie s-o treacă fără să caute cheia „paid".
  await seedStages(tenantB, "Contract semnat", "Refuzat de client");
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(leadInteractions);
  await testDb.delete(crmLeadTasks);
  await testDb.delete(leads);
  currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "ana@alfa.md" };
});

/** Creează un lead + tranziția lui către o etapă, ca în fluxul real. */
async function makeLead(opts: {
  tenantId: string;
  assignedTo?: string | null;
  stage?: string;
  valueCents?: number;
  createdAt?: Date;
  wonAt?: Date;
  lostReason?: string;
}) {
  const [lead] = await testDb
    .insert(leads)
    .values({
      tenantId: opts.tenantId,
      fullName: "Client test",
      stage: opts.stage ?? "new",
      valueCents: opts.valueCents ?? 0,
      assignedTo: opts.assignedTo ?? null,
      createdAt: opts.createdAt ?? new Date(),
      lostReason: opts.lostReason ?? null,
    })
    .returning();
  if (opts.wonAt) {
    await testDb.insert(leadInteractions).values({
      tenantId: opts.tenantId,
      leadId: lead.id,
      type: "stage_change",
      direction: "internal",
      body: "new → castigat",
      metadata: { from: "new", to: "castigat" },
      occurredAt: opts.wonAt,
    });
  }
  return lead;
}

describe("GET /api/crm/reports", () => {
  it("[blocant] rapoartele unui workspace nu includ datele altuia", async () => {
    await makeLead({ tenantId: tenantA, valueCents: 100_00, stage: "castigat", wonAt: new Date() });
    await makeLead({ tenantId: tenantB, valueCents: 999_00, stage: "castigat", wonAt: new Date() });
    await makeLead({ tenantId: tenantB, valueCents: 888_00 });

    const res = await app.request("/api/crm/reports");
    expect(res.status).toBe(200);
    const body = await res.json();
    // Un singur lead e al lui A; cei doi ai lui B nu au voie să apară nicăieri.
    expect(body.kpis.leadsAllocated).toBe(1);
    expect(JSON.stringify(body)).not.toContain("99900");
    expect(JSON.stringify(body)).not.toContain("88800");
  });

  it("[blocant] „câștigat” se derivă din flagul etapei, nu din cheia „paid”", async () => {
    // Workspace-ul B are etapa câștigată numită „Contract semnat", cheia „castigat".
    currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bogdan@beta.md" };
    const now = new Date();
    await makeLead({ tenantId: tenantB, stage: "castigat", valueCents: 250_00, wonAt: now });

    const res = await app.request("/api/crm/reports");
    const body = await res.json();
    expect(body.kpis.contractsSigned).toBe(1);
    expect(body.kpis.salesValueCents).toBe(250_00);
  });

  it("[blocant] durata medie a ciclului ignoră afacerile încă deschise", async () => {
    const created = new Date("2026-01-01T00:00:00Z");
    const won = new Date("2026-01-11T00:00:00Z"); // 10 zile
    await makeLead({ tenantId: tenantA, stage: "castigat", createdAt: created, wonAt: won });
    // Un lead deschis de o veșnicie — dacă ar intra în medie, ar strica cifra.
    await makeLead({ tenantId: tenantA, stage: "new", createdAt: new Date("2025-01-01T00:00:00Z") });

    const res = await app.request("/api/crm/reports");
    const body = await res.json();
    expect(body.cycleDays).toBeCloseTo(10, 0);
  });

  it("apelurile se numără, iar „contacte reușite” doar cele cu răspuns", async () => {
    const lead = await makeLead({ tenantId: tenantA, assignedTo: userA });
    await testDb.insert(leadInteractions).values([
      { tenantId: tenantA, leadId: lead.id, type: "call", direction: "outbound", metadata: { outcome: "answered" } },
      { tenantId: tenantA, leadId: lead.id, type: "call", direction: "outbound", metadata: { outcome: "no_answer" } },
      { tenantId: tenantA, leadId: lead.id, type: "meeting", direction: "outbound", metadata: {} },
    ]);

    const res = await app.request("/api/crm/reports");
    const body = await res.json();
    expect(body.kpis.callsMade).toBe(2);
    expect(body.kpis.successfulContacts).toBe(1);
    expect(body.kpis.meetings).toBe(1);
  });

  it("motivele pierderii se agregă pe valori, nu pe text liber per agent", async () => {
    await makeLead({ tenantId: tenantA, stage: "refuzat", lostReason: "Preț prea mare" });
    await makeLead({ tenantId: tenantA, stage: "refuzat", lostReason: "Preț prea mare" });
    await makeLead({ tenantId: tenantA, stage: "refuzat", lostReason: "A ales alt furnizor" });

    const res = await app.request("/api/crm/reports");
    const body = await res.json();
    const top = body.lostReasons[0];
    expect(top.reason).toBe("Preț prea mare");
    expect(top.count).toBe(2);
  });

  it("raportul pe un singur agent conține doar munca lui", async () => {
    await makeLead({ tenantId: tenantA, assignedTo: userA });
    await makeLead({ tenantId: tenantA, assignedTo: null });

    const res = await app.request(`/api/crm/reports?owner=${userA}`);
    const body = await res.json();
    expect(body.kpis.leadsAllocated).toBe(1);
  });

  it("tabelul pe echipă folosește aceeași socoteală ca fișa unui agent", async () => {
    await makeLead({ tenantId: tenantA, assignedTo: userA, valueCents: 500_00, stage: "castigat", wonAt: new Date() });

    const team = await (await app.request("/api/crm/reports")).json();
    const single = await (await app.request(`/api/crm/reports?owner=${userA}`)).json();
    const rowForAna = team.perOwner.find((r: { ownerKey: string }) => r.ownerKey === userA);
    // Dacă cele două ar diverge, un manager și un agent ar vedea cifre diferite
    // pentru aceeași muncă — exact ce evită folosirea aceleiași funcții.
    expect(rowForAna.salesValueCents).toBe(single.kpis.salesValueCents);
  });
});

describe("Perioada aleasă se aplică ÎNTREGULUI raport", () => {
  /**
   * Bugul (reparat 14.09.2026): doar plăcuțele și tabelul pe agent primeau intervalul. Alegeai
   * „luna aceasta" și conversia, durata ciclului, motivele pierderii și produsele arătau, tăcut,
   * datele dintotdeauna — antetul spunea o perioadă, tabelele alta.
   */
  it("[blocant] motivele pierderii sunt ale perioadei, nu dintotdeauna", async () => {
    const acum = new Date();
    const anulTrecut = new Date(acum.getFullYear() - 1, 2, 15);

    // Pierdut anul trecut — nu are ce căuta în raportul lunii curente.
    const vechi = await makeLead({
      tenantId: tenantA,
      stage: "refuzat",
      lostReason: "Preț prea mare",
      createdAt: anulTrecut,
    });
    await testDb.insert(leadInteractions).values({
      tenantId: tenantA,
      leadId: vechi.id,
      type: "stage_change",
      direction: "internal",
      body: "new → refuzat",
      metadata: { from: "new", to: "refuzat" },
      occurredAt: anulTrecut,
    });

    // Pierdut acum.
    const recent = await makeLead({ tenantId: tenantA, stage: "refuzat", lostReason: "A ales alt furnizor" });
    await testDb.insert(leadInteractions).values({
      tenantId: tenantA,
      leadId: recent.id,
      type: "stage_change",
      direction: "internal",
      body: "new → refuzat",
      metadata: { from: "new", to: "refuzat" },
      occurredAt: acum,
    });

    const from = new Date(acum.getFullYear(), acum.getMonth(), 1).toISOString();
    const res = await app.request(`/api/crm/reports?from=${encodeURIComponent(from)}`);
    const body = await res.json();

    const motive = (body.lostReasons as Array<{ reason: string }>).map((r) => r.reason);
    expect(motive).toEqual(["A ales alt furnizor"]);
    expect(motive).not.toContain("Preț prea mare");
  });

  it("[blocant] fără interval, raportul arată tot — filtrul nu ascunde date din greșeală", async () => {
    const anulTrecut = new Date(new Date().getFullYear() - 1, 2, 15);
    const vechi = await makeLead({
      tenantId: tenantA,
      stage: "refuzat",
      lostReason: "Preț prea mare",
      createdAt: anulTrecut,
    });
    await testDb.insert(leadInteractions).values({
      tenantId: tenantA,
      leadId: vechi.id,
      type: "stage_change",
      direction: "internal",
      body: "new → refuzat",
      metadata: { from: "new", to: "refuzat" },
      occurredAt: anulTrecut,
    });

    const body = await (await app.request("/api/crm/reports")).json();
    expect((body.lostReasons as Array<{ reason: string }>).map((r) => r.reason)).toContain("Preț prea mare");
  });

  it("[blocant] conversia numără tranzițiile DIN perioadă", async () => {
    const acum = new Date();
    const anulTrecut = new Date(acum.getFullYear() - 1, 5, 1);

    /** Un lead care trece prin „Contactat" și apoi e câștigat, la o dată dată. */
    const parcurs = async (cand: Date) => {
      const lead = await makeLead({ tenantId: tenantA, stage: "castigat", valueCents: 100_00, createdAt: cand });
      await testDb.insert(leadInteractions).values([
        {
          tenantId: tenantA,
          leadId: lead.id,
          type: "stage_change",
          direction: "internal",
          body: "new → contacted",
          metadata: { from: "new", to: "contacted" },
          occurredAt: cand,
        },
        {
          tenantId: tenantA,
          leadId: lead.id,
          type: "stage_change",
          direction: "internal",
          body: "contacted → castigat",
          metadata: { from: "contacted", to: "castigat" },
          occurredAt: new Date(cand.getTime() + 3600_000),
        },
      ]);
    };

    await parcurs(anulTrecut);
    await parcurs(acum);

    const from = new Date(acum.getFullYear(), acum.getMonth(), 1).toISOString();
    const body = await (await app.request(`/api/crm/reports?from=${encodeURIComponent(from)}`)).json();

    // Două parcursuri în bază, unul singur în perioadă.
    const pereche = (body.conversion as Array<{ fromKey: string; toKey: string; reached: number; advanced: number }>).find(
      (r) => r.fromKey === "contacted" && r.toKey === "castigat"
    );
    expect(pereche?.reached).toBe(1);
    expect(pereche?.advanced).toBe(1);

    const totIstoricul = await (await app.request("/api/crm/reports")).json();
    const perecheTot = (totIstoricul.conversion as Array<{ fromKey: string; toKey: string; reached: number }>).find(
      (r) => r.fromKey === "contacted" && r.toKey === "castigat"
    );
    expect(perecheTot?.reached).toBe(2);
  });
});

describe("Evoluția în timp", () => {
  it("[blocant] graficul numără vânzarea o singură dată, la data la care s-a produs", async () => {
    const acum = new Date();
    const from = new Date(acum.getFullYear(), acum.getMonth(), 1).toISOString();
    const lead = await makeLead({ tenantId: tenantA, stage: "castigat", valueCents: 500_00, wonAt: acum });
    // Plimbată înapoi și înainte: nu are voie să devină două vânzări.
    await testDb.insert(leadInteractions).values({
      tenantId: tenantA,
      leadId: lead.id,
      type: "stage_change",
      direction: "internal",
      body: "castigat → castigat",
      metadata: { from: "contacted", to: "castigat" },
      occurredAt: new Date(acum.getTime() + 3600_000),
    });

    const body = await (await app.request(`/api/crm/reports?from=${encodeURIComponent(from)}`)).json();
    const puncte = body.timeline as Array<{ contractsSigned: number; salesValueCents: number }>;

    expect(puncte.reduce((s, p) => s + p.contractsSigned, 0)).toBe(1);
    expect(puncte.reduce((s, p) => s + p.salesValueCents, 0)).toBe(500_00);
    // O lună se taie pe zile, ca graficul să fie citibil.
    expect(body.bucketSize).toBe("day");
  });

  it("[normal] graficul și plăcuțele spun ACELAȘI lucru despre vânzări", async () => {
    const acum = new Date();
    const from = new Date(acum.getFullYear(), acum.getMonth(), 1).toISOString();
    await makeLead({ tenantId: tenantA, stage: "castigat", valueCents: 100_00, wonAt: acum });
    await makeLead({ tenantId: tenantA, stage: "castigat", valueCents: 250_00, wonAt: acum });

    const body = await (await app.request(`/api/crm/reports?from=${encodeURIComponent(from)}`)).json();
    const puncte = body.timeline as Array<{ contractsSigned: number; salesValueCents: number }>;

    expect(puncte.reduce((s, p) => s + p.contractsSigned, 0)).toBe(body.kpis.contractsSigned);
    expect(puncte.reduce((s, p) => s + p.salesValueCents, 0)).toBe(body.kpis.salesValueCents);
  });
});

describe("CRM-G02 — raportul e al unei pâlnii", () => {
  /** Workspace propriu: pâlniile nu se șterg între teste, iar A trebuie să rămână cu una singură. */
  let tenantC: string;
  let userC: string;
  let vanzari: string;
  let cursuri: string;

  beforeAll(async () => {
    const [t] = await testDb.insert(tenants).values({ name: "Gama", slug: "gama-rap" }).returning();
    tenantC = t.id;
    const [u] = await testDb
      .insert(users)
      .values({ tenantId: tenantC, email: "gina@gama.md", passwordHash: "x", name: "Gina", role: "admin" })
      .returning();
    userC = u.id;
    const [p1] = await testDb.insert(crmPipelines).values({ tenantId: tenantC, name: "Vânzări", orderIndex: 0, isDefault: true }).returning();
    const [p2] = await testDb.insert(crmPipelines).values({ tenantId: tenantC, name: "Cursuri", orderIndex: 1 }).returning();
    vanzari = p1.id;
    cursuri = p2.id;
    await testDb.insert(crmPipelineStages).values([
      { tenantId: tenantC, pipelineId: vanzari, key: "new", label: "Lead nou", orderIndex: 0, probabilityPct: 10 },
      { tenantId: tenantC, pipelineId: vanzari, key: "oferta", label: "Ofertă", orderIndex: 1, probabilityPct: 50 },
      { tenantId: tenantC, pipelineId: vanzari, key: "client", label: "Client", orderIndex: 2, isWon: true, probabilityPct: 100 },
      { tenantId: tenantC, pipelineId: vanzari, key: "pierdut", label: "Pierdut", orderIndex: 3, isLost: true, probabilityPct: 0 },
      // A doua pâlnie are etape cu orderIndex care se INTERCALEAZĂ cu primele — exact situația
      // în care vechiul raport lega „Lead nou" de „Cerere" și ieșea un lanț fără sens.
      { tenantId: tenantC, pipelineId: cursuri, key: "cerere", label: "Cerere", orderIndex: 0, probabilityPct: 10 },
      { tenantId: tenantC, pipelineId: cursuri, key: "inscris", label: "Înscris", orderIndex: 1, isWon: true, probabilityPct: 100 },
    ]);
  });

  beforeEach(() => {
    currentUser = { id: userC, tenantId: tenantC, role: "admin", email: "gina@gama.md" };
  });

  async function lead(pipelineId: string, stage: string, valueCents: number, to?: string) {
    const [l] = await testDb
      .insert(leads)
      .values({ tenantId: tenantC, pipelineId, fullName: "X", stage, valueCents, assignedTo: userC, source: "referral" })
      .returning();
    if (to) {
      await testDb.insert(leadInteractions).values({
        tenantId: tenantC,
        leadId: l.id,
        type: "stage_change",
        direction: "internal",
        metadata: { from: "new", to },
        occurredAt: new Date(),
      });
    }
    return l;
  }

  it("[blocant] implicit, etapele și conversia sunt DOAR ale pâlniei implicite", async () => {
    await lead(vanzari, "client", 300_00, "client");
    await lead(cursuri, "inscris", 999_00, "inscris");

    const body = await (await app.request("/api/crm/reports")).json();
    expect(body.pipelineId).toBe(vanzari);
    const keys = (body.stages as Array<{ key: string }>).map((st) => st.key);
    expect(keys).toEqual(["new", "oferta", "client", "pierdut"]);
    const pairs = (body.conversion as Array<{ fromKey: string; toKey: string }>).map((r) => `${r.fromKey}>${r.toKey}`);
    expect(pairs).toEqual(["new>oferta", "oferta>client"]);
    // Vânzarea din cealaltă pâlnie nu umflă cifrele pâlniei de vânzări.
    expect(body.kpis.salesValueCents).toBe(300_00);
    expect(body.outcomes.wonCount).toBe(1);
  });

  it("[blocant] pâlnia cerută explicit îi dă propriile cifre; `all` = toată baza", async () => {
    await lead(vanzari, "client", 300_00, "client");
    await lead(cursuri, "inscris", 999_00, "inscris");
    const cur = await (await app.request(`/api/crm/reports?pipelineId=${cursuri}`)).json();
    expect(cur.pipelineId).toBe(cursuri);
    expect(cur.kpis.salesValueCents).toBe(999_00);
    expect(cur.funnel.map((r: { key: string }) => r.key)).toEqual(["cerere", "inscris"]);

    const all = await (await app.request("/api/crm/reports?pipelineId=all")).json();
    expect(all.pipelineId).toBeNull();
    expect(all.kpis.salesValueCents).toBe(1_299_00);
    // Pe toată baza nu există un lanț de etape — pâlnia nu se desenează.
    expect(all.funnel).toEqual([]);
  });

  it("[blocant] o pâlnie a ALTUI workspace nu deschide datele lui — cade pe implicita ta", async () => {
    const [straina] = await testDb.insert(crmPipelines).values({ tenantId: tenantA, name: "Străină", orderIndex: 5 }).returning();
    const body = await (await app.request(`/api/crm/reports?pipelineId=${straina.id}`)).json();
    expect(body.pipelineId).toBe(vanzari);
    await testDb.delete(crmPipelines).where(eq(crmPipelines.id, straina.id));
  });

  it("[normal] răspunsul are rezultatele, perioada precedentă, sursele și afacerile care stagnează", async () => {
    await lead(vanzari, "client", 300_00, "client");
    const from = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const body = await (await app.request(`/api/crm/reports?from=${encodeURIComponent(from)}`)).json();
    expect(body.outcomes).toMatchObject({ wonCount: 1, winRatePct: 100, avgDealCents: 300_00 });
    expect(body.previous?.outcomes).toMatchObject({ wonCount: 0 });
    expect(body.sources[0]).toMatchObject({ source: "referral" });
    expect(Array.isArray(body.aging.buckets)).toBe(true);
    expect(body.leaderboard.find((r: { ownerKey: string }) => r.ownerKey === userC)).toMatchObject({ wonCount: 1 });
    expect(body.timeline.every((b: { lostCount: number }) => typeof b.lostCount === "number")).toBe(true);
  });
});

describe("CRM-G09 — segmente, insighturi, aranjament personal", () => {
  async function segLead(tenantId: string, stage: string, extra: { companyId?: string; source?: "referral" | "facebook_ad" } = {}) {
    const [l] = await testDb
      .insert(leads)
      .values({ tenantId, fullName: "Seg", stage, valueCents: 100_00, source: extra.source ?? "manual", companyId: extra.companyId ?? null })
      .returning();
    return l;
  }

  it("[blocant] raportul pe segment vede regiunea firmei și câmpul personalizat „Oraș”, cu cea mai bună / cea mai slabă valoare", async () => {
    const [nord] = await testDb.insert(crmCompanies).values({ tenantId: tenantA, name: "Nord SRL", region: "Nord" }).returning();
    const [sud] = await testDb.insert(crmCompanies).values({ tenantId: tenantA, name: "Sud SRL", region: "Sud" }).returning();
    const [oras] = await testDb.insert(customFields).values({ tenantId: tenantA, key: "oras", label: "Oraș", type: "text" }).returning();
    // Workspace-ul B are același câmp, cu o valoare care n-are voie să ajungă la A.
    const [orasB] = await testDb.insert(customFields).values({ tenantId: tenantB, key: "oras", label: "Oraș", type: "text" }).returning();

    for (let i = 0; i < 3; i++) {
      const won = await segLead(tenantA, "castigat", { companyId: nord.id, source: "referral" });
      await testDb.insert(leadFieldValues).values({ tenantId: tenantA, leadId: won.id, fieldId: oras.id, value: "Chișinău" });
      const lost = await segLead(tenantA, "refuzat", { companyId: sud.id, source: "facebook_ad" });
      await testDb.insert(leadFieldValues).values({ tenantId: tenantA, leadId: lost.id, fieldId: oras.id, value: "Bălți" });
    }
    const foreign = await segLead(tenantB, "castigat");
    await testDb.insert(leadFieldValues).values({ tenantId: tenantB, leadId: foreign.id, fieldId: orasB.id, value: "Tiraspol" });

    const res = await app.request("/api/crm/reports?pipelineId=all");
    expect(res.status).toBe(200);
    const body = await res.json();
    const dim = (key: string) => body.dimensions.find((d: { key: string }) => d.key === key);

    expect(dim("region").rows.map((r: { value: string }) => r.value).sort()).toEqual(["Nord", "Sud"]);
    expect(dim("cf_oras")).toMatchObject({ label: "Oraș", kind: "custom" });
    expect(JSON.stringify(body)).not.toContain("Tiraspol");

    const spread = body.insights.find((i: { kind: string; dimension?: string }) => i.kind === "segmentSpread" && i.dimension === "cf_oras");
    expect(spread).toMatchObject({ best: { value: "Chișinău", conversionPct: 100 }, worst: { value: "Bălți", conversionPct: 0 } });
    const bySource = body.insights.find((i: { kind: string; dimension?: string }) => i.kind === "segmentSpread" && i.dimension === "source");
    expect(bySource).toMatchObject({ best: { value: "referral" }, worst: { value: "facebook_ad" } });

    await testDb.delete(leadFieldValues);
    await testDb.delete(customFields);
  });

  it("[blocant] aranjamentul e personal: se salvează, se citește înapoi, nu se vede la alt om", async () => {
    expect(await (await app.request("/api/crm/reports/layout")).json()).toEqual({ layout: null });

    const layout = { order: ["team", "insights"], hidden: ["calls"], hiddenMetrics: ["cycle"], segmentDimension: "cf_oras" };
    const put = await app.request("/api/crm/reports/layout", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(layout),
    });
    expect(put.status).toBe(200);
    // A doua salvare actualizează rândul, nu creează altul.
    await app.request("/api/crm/reports/layout", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...layout, hidden: [] }),
    });
    expect((await (await app.request("/api/crm/reports/layout")).json()).layout).toMatchObject({ order: ["team", "insights"], hidden: [] });

    currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bogdan@beta.md" };
    expect(await (await app.request("/api/crm/reports/layout")).json()).toEqual({ layout: null });
  });

  it("[normal] un aranjament malformat e refuzat, nu salvat", async () => {
    const res = await app.request("/api/crm/reports/layout", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order: "team" }),
    });
    expect(res.status).toBe(400);
  });
});
