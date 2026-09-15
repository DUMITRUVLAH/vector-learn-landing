/**
 * @vitest-environment node
 * API-UL PUBLIC CU CHEI — INTEGRATION (cerințele 64 și 71 din caietul de sarcini).
 *
 * Tabela `api_keys` și middleware-ul `requireApiKey` existau din INT-901, dar NICIO rută nu le
 * folosea, iar ecranul de administrare a cheilor nu exista: clientul chema `/api/settings/api-keys`,
 * care cădea pe fallback-ul SPA. Matricea spunea corect „Parțial: fără documentație publică și
 * fără chei de acces pentru terți".
 *
 * Ce apără testele, în ordinea gravității:
 *  1. **o cheie citește DOAR workspace-ul ei** — altfel API-ul public ar fi o scurgere între clienți;
 *  2. **cheia nu poate scrie nimic** — nu există rută de scriere, și nici nu trebuie să apară;
 *  3. cheia revocată nu mai intră, iar răspunsul nu spune că a existat cândva;
 *  4. cheia în clar se vede o singură dată, la creare;
 *  5. specificația OpenAPI descrie EXACT rutele montate — o rută nedocumentată e o promisiune
 *     pe care integratorul n-o găsește, iar o cale documentată fără rută e o minciună.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { apiKeys } from "../db/schema/apiKeys";
import { leads } from "../db/schema/leads";
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
let receptionA: { id: string; tenantId: string; role: string; email: string };
let keyA = "";
let keyB = "";

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

/** Cerere pe API-ul public, cu cheia dată. */
function api(url: string, key?: string) {
  return app.request(`/api/public/v1${url}`, key ? { headers: { "X-API-Key": key } } : undefined);
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { publicApiRoutes } = await import("../routes/publicApi");
  const { apiKeysRoutes } = await import("../routes/apiKeys");
  app = new Hono();
  app.route("/api/public/v1", publicApiRoutes);
  app.route("/api/settings/api-keys", apiKeysRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Ecosolar", slug: "eco-api" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Rival", slug: "rival-api" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;

  const [uA] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@eco.md", passwordHash: "x", name: "Ana", role: "admin" })
    .returning();
  const [uR] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "rec@eco.md", passwordHash: "x", name: "Rita", role: "receptionist" })
    .returning();
  const [uB] = await testDb
    .insert(users)
    .values({ tenantId: tenantB, email: "bob@rival.md", passwordHash: "x", name: "Bob", role: "admin" })
    .returning();
  adminA = { id: uA.id, tenantId: tenantA, role: "admin", email: uA.email };
  receptionA = { id: uR.id, tenantId: tenantA, role: "receptionist", email: uR.email };
  session = adminA;

  await testDb.insert(crmPipelineStages).values([
    { tenantId: tenantA, key: "new", label: "Lead nou", orderIndex: 0, probabilityPct: 10 },
    { tenantId: tenantA, key: "paid", label: "Câștigat", orderIndex: 1, isWon: true, probabilityPct: 100 },
    { tenantId: tenantA, key: "lost", label: "Pierdut", orderIndex: 2, isLost: true, probabilityPct: 0 },
  ]);
  const [firma] = await testDb
    .insert(crmCompanies)
    .values({ tenantId: tenantA, name: "Alfa Logistic SRL", industry: "Transport", region: "Chișinău" })
    .returning();
  await testDb.insert(leads).values([
    { tenantId: tenantA, fullName: "Lead Deschis", stage: "new", valueCents: 100_000, companyId: firma.id },
    { tenantId: tenantA, fullName: "Lead Câștigat", stage: "paid", valueCents: 50_000 },
    { tenantId: tenantA, fullName: "Lead Pierdut", stage: "lost", valueCents: 20_000, lostReason: "preț" },
    { tenantId: tenantA, fullName: "Fără consimțământ", stage: "new", valueCents: 0, consentRevokedAt: new Date() },
    { tenantId: tenantB, fullName: "Lead Rival", stage: "new", valueCents: 999_000 },
  ]);

  // Cheile se creează prin API, nu direct în bază: așa se testează și ruta de administrare.
  session = adminA;
  const resA = await app.request("/api/settings/api-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Power BI" }),
  });
  keyA = (await resA.json()).key;

  session = { id: uB.id, tenantId: tenantB, role: "admin", email: uB.email };
  const resB = await app.request("/api/settings/api-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Cheia rivalului" }),
  });
  keyB = (await resB.json()).key;
  session = adminA;
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

beforeEach(() => {
  session = adminA;
});

describe("Administrarea cheilor", () => {
  it("[blocant] cheia în clar se vede O SINGURĂ dată, la creare", async () => {
    const res = await app.request("/api/settings/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Integrare Zapier" }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.key).toMatch(/^fk_/);
    expect(created.prefix).toBe(created.key.slice(0, 8));

    // La listare nu mai apare nicăieri — nici cheia, nici hash-ul ei.
    const list = await (await app.request("/api/settings/api-keys")).json();
    const row = list.find((k: { id: string }) => k.id === created.id);
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toContain(created.key);
    expect(row.keyHash).toBeUndefined();
  });

  it("[blocant] cheile altui workspace nu se văd", async () => {
    const list = await (await app.request("/api/settings/api-keys")).json();
    expect(list.some((k: { name: string }) => k.name === "Cheia rivalului")).toBe(false);
  });

  it("[blocant] recepția nu poate fabrica chei", async () => {
    session = receptionA;
    const res = await app.request("/api/settings/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Nu ar trebui" }),
    });
    expect(res.status).toBe(403);
    expect((await app.request("/api/settings/api-keys")).status).toBe(403);
  });

  it("[blocant] revocarea oprește cheia imediat, dar nu șterge urma ei", async () => {
    const created = await (
      await app.request("/api/settings/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "De revocat" }),
      })
    ).json();

    expect((await api("/leads", created.key)).status).toBe(200);

    const del = await app.request(`/api/settings/api-keys/${created.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);

    // Aceeași cheie, după revocare: refuzată, cu același mesaj ca una inventată.
    const after = await api("/leads", created.key);
    expect(after.status).toBe(401);
    expect((await after.json()).error).toBe("invalid_api_key");

    // Rândul rămâne, cu data revocării — altfel n-ai cum răspunde la „ce cheie a citit baza".
    const [row] = await testDb.select().from(apiKeys).where(eq(apiKeys.id, created.id));
    expect(row.revokedAt).not.toBeNull();
    expect(row.name).toBe("De revocat");
  });

  it("[normal] cheia altui workspace nu se poate revoca — 404, nu 403", async () => {
    const [rivalKey] = await testDb.select().from(apiKeys).where(eq(apiKeys.tenantId, tenantB));
    const res = await app.request(`/api/settings/api-keys/${rivalKey.id}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("API-ul public", () => {
  it("[blocant] fără cheie nu se citește nimic", async () => {
    expect((await api("/leads")).status).toBe(401);
    expect((await api("/companies")).status).toBe(401);
    expect((await api("/reports/summary")).status).toBe(401);
  });

  it("[blocant] o cheie citește DOAR workspace-ul ei", async () => {
    const mine = await (await api("/leads", keyA)).json();
    const names = mine.items.map((l: { fullName: string }) => l.fullName);
    expect(names).toContain("Lead Deschis");
    expect(names).not.toContain("Lead Rival");

    const theirs = await (await api("/leads", keyB)).json();
    expect(theirs.items.map((l: { fullName: string }) => l.fullName)).toEqual(["Lead Rival"]);
  });

  it("[blocant] nu există nicio cale de SCRIERE pe API-ul public", async () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const res = await app.request("/api/public/v1/leads", { method, headers: { "X-API-Key": keyA } });
      // 404/405 — orice, numai 2xx nu.
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  it("[blocant] leadul cu consimțământul retras iese MARCAT", async () => {
    const body = await (await api("/leads", keyA)).json();
    const lead = body.items.find((l: { fullName: string }) => l.fullName === "Fără consimțământ");
    expect(lead.consentRevoked).toBe(true);
    const normal = body.items.find((l: { fullName: string }) => l.fullName === "Lead Deschis");
    expect(normal.consentRevoked).toBe(false);
  });

  it("[blocant] coloanele interne nu ies din aplicație", async () => {
    const body = await (await api("/leads", keyA)).json();
    const raw = JSON.stringify(body);
    for (const internal of ["phoneNormalized", "phone_normalized", "emailNormalized", "tenantId", "tenant_id", "ipAtConsent"]) {
      expect(raw, `câmpul intern ${internal} a ieșit în API`).not.toContain(internal);
    }
  });

  it("[blocant] rezumatul calculează conversia pe afacerile ÎNCHISE", async () => {
    const body = await (await api("/reports/summary", keyA)).json();
    expect(body.leads.won).toBe(1);
    expect(body.leads.lost).toBe(1);
    // 1 câștigat din 2 închise = 50%, deși în bază sunt 4 leaduri.
    expect(body.leads.conversionPctOnClosed).toBe(50);
    // Forecast: 500,00 (câștigat, 100%) + 1.000,00 × 10% + 0 = 600,00 lei.
    expect(body.leads.weightedForecastCents).toBe(60_000);
  });

  it("[normal] paginarea are plafon — o cerere nu poate trage toată baza", async () => {
    const body = await (await api("/leads?pageSize=100000", keyA)).json();
    expect(body.pageSize).toBe(200);
  });

  it("[normal] `updatedSince` filtrează pe modificare", async () => {
    const viitor = new Date(Date.now() + 86_400_000).toISOString();
    const body = await (await api(`/leads?updatedSince=${viitor}`, keyA)).json();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("[normal] nomenclatoarele se citesc la fel de strâns pe tenant", async () => {
    const firme = await (await api("/companies", keyA)).json();
    expect(firme.items.map((f: { name: string }) => f.name)).toEqual(["Alfa Logistic SRL"]);
    const alteFirme = await (await api("/companies", keyB)).json();
    expect(alteFirme.items).toEqual([]);
  });
});

describe("Specificația OpenAPI", () => {
  it("[blocant] se servește fără cheie — descrie forma datelor, nu datele", async () => {
    const res = await api("/openapi.json");
    expect(res.status).toBe(200);
    const doc = await res.json();
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.components.securitySchemes.ApiKeyAuth.name).toBe("X-API-Key");
  });

  it("[blocant] fiecare rută montată e documentată, și fiecare cale documentată există", async () => {
    const doc = await (await api("/openapi.json")).json();
    const documented = new Set(Object.keys(doc.paths));

    // Rutele reale ale routerului, aduse la forma OpenAPI (`:id` → `{id}`).
    const { publicApiRoutes } = await import("../routes/publicApi");
    const mounted = new Set(
      publicApiRoutes.routes
        .filter((r) => r.method === "GET" && r.path !== "/*")
        .map((r) => r.path.replace(/:(\w+)/g, "{$1}"))
    );

    for (const route of mounted) {
      expect(documented, `ruta ${route} nu e în specificație`).toContain(route);
    }
    for (const route of documented) {
      expect(mounted, `specificația promite ${route}, dar ruta nu există`).toContain(route);
    }
  });
});
