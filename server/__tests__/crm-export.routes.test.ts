/**
 * @vitest-environment node
 * EXPORTUL BAZEI DE LEADURI — INTEGRATION (dreptul `leads.export`, cerințele 58 și 63).
 *
 * Dreptul „Exportă leaduri" exista în matricea de permisiuni și se vedea în ecranul „Drepturi",
 * dar nu deschidea nimic — nu exista niciun export de leaduri. Testele apără cele patru lucruri
 * care fac diferența dintre un export util și unul periculos:
 *
 *  1. exportul respectă EXACT filtrul cerut (altfel omul segmentează 2 firme și primește baza);
 *  2. nu trece granița workspace-ului;
 *  3. dreptul chiar oprește pe cine nu-l are (agentul care pleacă la concurență);
 *  4. consimțământul retras pleacă ÎMPREUNĂ cu datele — altfel fișierul devine o listă de apel
 *     care încalcă exact dreptul pe care omul l-a exercitat.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads } from "../db/schema/leads";
import { auditLog } from "../db/schema/auditLog";
import { crmCompanies } from "../db/schema/crmCompanies";
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
let adminA: { id: string; tenantId: string; role: string; email: string };
/** Recepția NU are `leads.export` în matrice — e testul că dreptul chiar contează. */
let receptionA: { id: string; tenantId: string; role: string; email: string };
let adminB: { id: string; tenantId: string; role: string; email: string };

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

/** Fișierul, ca rânduri — fără BOM și fără rândul gol de la final. */
async function csvRows(res: Response): Promise<string[]> {
  const text = (await res.text()).replace(/^﻿/, "");
  return text.trim().split("\r\n");
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmLeadsRoutes } = await import("../routes/crmLeads");
  app = new Hono();
  app.route("/api/crm/leads", crmLeadsRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-exp" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Rival", slug: "rival-exp" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;

  const [uAdmin] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@eco.md", passwordHash: "x", name: "Ana Admin", role: "admin" })
    .returning();
  const [uReception] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "rec@eco.md", passwordHash: "x", name: "Rita", role: "receptionist" })
    .returning();
  const [uB] = await testDb
    .insert(users)
    .values({ tenantId: tenantB, email: "bob@rival.md", passwordHash: "x", name: "Bob", role: "admin" })
    .returning();

  adminA = { id: uAdmin.id, tenantId: tenantA, role: "admin", email: uAdmin.email };
  receptionA = { id: uReception.id, tenantId: tenantA, role: "receptionist", email: uReception.email };
  adminB = { id: uB.id, tenantId: tenantB, role: "admin", email: uB.email };
  session = adminA;

  await testDb.insert(crmPipelineStages).values([
    { tenantId: tenantA, key: "new", label: "Lead nou", orderIndex: 0 },
  ]);

  const [fabrica] = await testDb
    .insert(crmCompanies)
    .values({
      tenantId: tenantA,
      name: "Fabrica de Zahăr",
      industry: "Industrie alimentară",
      region: "Nord",
      companySize: "51-250",
      annualConsumptionKwh: "900000",
    })
    .returning();

  await testDb.insert(leads).values([
    {
      tenantId: tenantA,
      fullName: "Lead Fabrica",
      stage: "new",
      companyId: fabrica.id,
      valueCents: 125050,
      assignedTo: uAdmin.id,
      consentAt: new Date(),
    },
    {
      // Numele conține punct-și-virgulă: exact caracterul care rupe un CSV scris prost.
      tenantId: tenantA,
      fullName: 'Ionescu; "Ion" SRL',
      stage: "new",
      consentAt: new Date(),
      consentRevokedAt: new Date(),
    },
    { tenantId: tenantB, fullName: "Lead Rival", stage: "new" },
  ]);
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(() => {
  session = adminA;
});

describe("Exportul leadurilor", () => {
  it("[blocant] exportă doar leadurile workspace-ului, cu antet în română", async () => {
    const res = await app.request("/api/crm/leads/export.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");

    const rows = await csvRows(res);
    expect(rows[0].startsWith("Nume;Denumire oportunitate;Companie")).toBe(true);
    expect(rows.length).toBe(3); // antet + 2 leaduri ale tenantului A
    expect(rows.join("\n")).not.toContain("Lead Rival");
    expect(res.headers.get("x-export-count")).toBe("2");
    expect(res.headers.get("x-export-truncated")).toBe("false");
  });

  it("[blocant] exportul respectă EXACT filtrul cerut, nu toată baza", async () => {
    const res = await app.request("/api/crm/leads/export.csv?industry=Industrie%20alimentar%C4%83");
    const rows = await csvRows(res);

    expect(res.headers.get("x-export-count")).toBe("1");
    expect(rows.length).toBe(2);
    expect(rows[1]).toContain("Lead Fabrica");
    // Firmografia după care s-a filtrat intră în fișier — altfel ar cere un VLOOKUP.
    expect(rows[1]).toContain("Industrie alimentară");
    expect(rows[1]).toContain("900000");
  });

  it("[blocant] fără dreptul `leads.export`, exportul e refuzat", async () => {
    session = receptionA;
    const res = await app.request("/api/crm/leads/export.csv");
    expect(res.status).toBe(403);
  });

  it("[blocant] consimțământul retras pleacă ÎMPREUNĂ cu datele", async () => {
    const rows = await csvRows(await app.request("/api/crm/leads/export.csv"));
    const randRetras = rows.find((r) => r.includes("Ionescu"));
    expect(randRetras).toBeDefined();
    expect(randRetras).toContain("RETRAS");
  });

  it("[blocant] un nume cu „;” și ghilimele nu rupe fișierul", async () => {
    const rows = await csvRows(await app.request("/api/crm/leads/export.csv"));
    const randCitat = rows.find((r) => r.includes("Ionescu"));
    // Câmpul e încadrat, iar ghilimelele dinăuntru sunt dublate — regula CSV, nu o preferință.
    expect(randCitat!.startsWith('"Ionescu; ""Ion"" SRL";')).toBe(true);
  });

  it("[blocant] exportul se scrie în jurnal — cine, câte, cu ce filtru", async () => {
    await app.request("/api/crm/leads/export.csv?industry=Industrie%20alimentar%C4%83");
    const rows = await testDb
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.tenantId, tenantA), eq(auditLog.actionType, "crm.lead.exported")));

    expect(rows.length).toBeGreaterThan(0);
    const ultima = rows[rows.length - 1];
    expect(ultima.actorId).toBe(adminA.id);
    expect((ultima.newValue as { count: number }).count).toBe(1);
    expect((ultima.newValue as { filters: Record<string, string> }).filters.industry).toBe("Industrie alimentară");
  });

  it("[normal] valoarea merge cu virgulă zecimală, cum o citește Excel-ul în română", async () => {
    const rows = await csvRows(await app.request("/api/crm/leads/export.csv"));
    expect(rows.find((r) => r.includes("Lead Fabrica"))).toContain("1250,50");
  });

  it("[normal] alt workspace exportă propriile leaduri, nu pe ale mele", async () => {
    session = adminB;
    const rows = await csvRows(await app.request("/api/crm/leads/export.csv"));
    expect(rows.length).toBe(2);
    expect(rows[1]).toContain("Lead Rival");
  });
});
