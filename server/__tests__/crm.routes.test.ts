/**
 * @vitest-environment node
 *
 * CRM Faza 1 — Leads/Pipeline + Produse, pe o bază PGlite reală (migrările chiar rulate, nu un
 * mock peste tabele).
 *
 * Testele de PRODUSE se auto-suspendă (`describe.skipIf`) dacă `crm_products` nu există încă în
 * migrările replay-uite la momentul rulării — schema/migrarea sunt livrate separat, în paralel;
 * nu inventăm tabela aici, doar așteptăm ca ea să apară pe branch.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { leads } from "../db/schema/leads";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

type CurrentUser = { id: string; tenantId: string; role: string; email: string };
let currentUser: CurrentUser;

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", currentUser);
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela poate să nu existe încă
let crmProductsTable: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- idem, ruta poate să nu existe încă
let crmProductsRoutesRef: any = null;

// IMPORTANT: detecția trebuie să se termine ÎNAINTE de `describe.skipIf(...)` de mai jos — acelea
// se evaluează în faza de COLECTARE (sincron, la parsarea fișierului), nu în `beforeAll` (care
// rulează abia în faza de execuție, mult după ce `describe.skipIf` și-a citit deja `hasCrmProducts`).
// De-aia detecția e un top-level await, nu o mutăm în `beforeAll`.
let hasCrmProducts = false;
try {
  const productsSchema = await import("../db/schema/crmProducts");
  const productsRoutesModule = await import("../routes/crmProducts");
  crmProductsTable = productsSchema.crmProducts;
  crmProductsRoutesRef = productsRoutesModule.crmProductsRoutes;
  hasCrmProducts = true;
} catch {
  hasCrmProducts = false;
}

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

let tenantA: string;
let userA: string;
let tenantB: string;
let userB: string;

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmLeadsRoutes } = await import("../routes/crmLeads");
  app = new Hono();
  app.route("/api/crm/leads", crmLeadsRoutes);

  // Ruta + schema de produse pot să nu existe încă (livrate separat, în paralel) — vezi detecția
  // (top-level await) de mai sus, care a stabilit deja `hasCrmProducts`.
  if (hasCrmProducts && crmProductsRoutesRef) {
    app.route("/api/crm/products", crmProductsRoutesRef);
  }

  const [tA] = await testDb
    .insert(tenants)
    .values({ name: "Vector Learn Demo A", slug: "crm-faza1-test-a" })
    .returning();
  tenantA = tA.id;
  const [uA] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "andreea@test-a.md", passwordHash: "x", name: "Andreea", role: "admin" })
    .returning();
  userA = uA.id;

  const [tB] = await testDb
    .insert(tenants)
    .values({ name: "Vector Learn Demo B", slug: "crm-faza1-test-b" })
    .returning();
  tenantB = tB.id;
  const [uB] = await testDb
    .insert(users)
    .values({ tenantId: tenantB, email: "bogdan@test-b.md", passwordHash: "x", name: "Bogdan", role: "admin" })
    .returning();
  userB = uB.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  // Cascadă: ștergerea lead-urilor șterge automat lead_interactions (onDelete: cascade).
  await testDb.delete(leads);
  if (hasCrmProducts && crmProductsTable) {
    await testDb.delete(crmProductsTable);
  }
  currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "andreea@test-a.md" };
});

/** Creează un lead ca tenantul/userul curent și întoarce rândul creat. */
async function createLead(overrides: Record<string, unknown> = {}) {
  const res = await app.request("/api/crm/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fullName: "Ion Vasilescu", ...overrides }),
  });
  expect(res.status).toBe(201);
  return res.json();
}

// ─── PATCH /:id/stage — reguli de business ────────────────────────────────────

describe("PATCH /api/crm/leads/:id/stage", () => {
  it("[blocant] un lead mutat în „pierdut” fără motiv e refuzat", async () => {
    const lead = await createLead();

    const res = await app.request(`/api/crm/leads/${lead.id}/stage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "lost" }),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("lost_reason_required");

    // Lead-ul nu s-a mutat de fapt.
    const stillNew = await (await app.request(`/api/crm/leads/${lead.id}`)).json();
    expect(stillNew.stage).toBe("new");
  });

  it("[blocant] mutarea între etape lasă o urmă în istoric (stage_change)", async () => {
    const lead = await createLead();

    const res = await app.request(`/api/crm/leads/${lead.id}/stage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "contacted" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).stage).toBe("contacted");

    const { items } = await (
      await app.request(`/api/crm/leads/${lead.id}/interactions`)
    ).json();

    const stageChange = items.find((i: { type: string }) => i.type === "stage_change");
    expect(stageChange).toBeTruthy();
    expect(stageChange.direction).toBe("internal");
    expect(stageChange.body).toBe("new → contacted");
    expect(stageChange.metadata).toEqual({ from: "new", to: "contacted", lostReason: null });
    expect(stageChange.tenantId).toBe(tenantA);
    expect(stageChange.userId).toBe(userA);
  });

  it("mutarea în „pierdut” CU motiv trece și salvează motivul pe interacțiune", async () => {
    const lead = await createLead();

    const res = await app.request(`/api/crm/leads/${lead.id}/stage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "lost", lostReason: "Preț prea mare" }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.stage).toBe("lost");
    expect(updated.lostReason).toBe("Preț prea mare");

    const { items } = await (
      await app.request(`/api/crm/leads/${lead.id}/interactions`)
    ).json();
    const stageChange = items.find((i: { type: string }) => i.type === "stage_change");
    expect(stageChange.metadata).toEqual({ from: "new", to: "lost", lostReason: "Preț prea mare" });
  });
});

// ─── Izolare multi-tenant — cel mai important test din fișier ────────────────

describe("Izolare multi-tenant", () => {
  it("[blocant] un lead din alt tenant nu e vizibil / nu poate fi modificat", async () => {
    const leadA = await createLead({ fullName: "Client Tenant A" });

    // Comutăm sesiunea pe tenantul B.
    currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bogdan@test-b.md" };

    const getRes = await app.request(`/api/crm/leads/${leadA.id}`);
    expect(getRes.status).toBe(404);

    const patchRes = await app.request(`/api/crm/leads/${leadA.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName: "Am furat lead-ul" }),
    });
    expect(patchRes.status).toBe(404);

    const stageRes = await app.request(`/api/crm/leads/${leadA.id}/stage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "contacted" }),
    });
    expect(stageRes.status).toBe(404);

    const interactionsRes = await app.request(`/api/crm/leads/${leadA.id}/interactions`);
    expect(interactionsRes.status).toBe(404);

    // Nici lista tenantului B nu-l arată.
    const listB = await (await app.request("/api/crm/leads")).json();
    expect(listB.items).toHaveLength(0);
    expect(listB.total).toBe(0);

    // Lead-ul original, văzut de tenantul A, e neatins.
    currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "andreea@test-a.md" };
    const original = await (await app.request(`/api/crm/leads/${leadA.id}`)).json();
    expect(original.fullName).toBe("Client Tenant A");
  });
});

// ─── GET /pipeline — numărători pe setul COMPLET, nu doar pe cele plafonate ──

describe("GET /api/crm/leads/pipeline", () => {
  it("numărătorile din pipeline sunt pe TOATE lead-urile, nu doar pe cele 50 afișate", async () => {
    const N = 55;
    for (let i = 0; i < N; i++) {
      await createLead({ fullName: `Lead ${i}`, valueCents: 1000 });
    }

    const body = await (await app.request("/api/crm/leads/pipeline")).json();

    expect(body.counts.new).toBe(N);
    expect(body.grouped.new).toHaveLength(50);
    expect(body.valueSums.new).toBe(N * 1000);
    expect(body.totalValueCents).toBe(N * 1000);

    // Celelalte etape rămân la 0, nu `undefined`.
    expect(body.counts.contacted).toBe(0);
    expect(body.grouped.contacted).toHaveLength(0);
  });
});

// ─── GET / — căutare ──────────────────────────────────────────────────────────

describe("GET /api/crm/leads — căutare", () => {
  it("căutarea găsește lead-ul după telefon și după email", async () => {
    await createLead({
      fullName: "Maria Ionescu",
      phone: "0791122334",
      email: "maria.ionescu@vector.md",
    });
    await createLead({ fullName: "Alt lead, fără legătură", phone: "0699887766" });

    const byPhone = await (await app.request("/api/crm/leads?search=791122")).json();
    expect(byPhone.items).toHaveLength(1);
    expect(byPhone.items[0].fullName).toBe("Maria Ionescu");

    // Case-insensitive.
    const byEmail = await (
      await app.request(`/api/crm/leads?search=${encodeURIComponent("MARIA.IONESCU")}`)
    ).json();
    expect(byEmail.items).toHaveLength(1);
    expect(byEmail.items[0].fullName).toBe("Maria Ionescu");
  });
});

// ─── PATCH parțial + interacțiuni directe (sanity pentru restul rutelor) ─────

describe("PATCH /api/crm/leads/:id", () => {
  it("actualizarea parțială schimbă doar câmpurile trimise și normalizează telefonul nou", async () => {
    const lead = await createLead({ fullName: "Nume Vechi", company: "SRL Vechi" });

    const res = await app.request(`/api/crm/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fullName: "Nume Nou", phone: "+373 (79) 11-22-334" }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.fullName).toBe("Nume Nou");
    expect(updated.company).toBe("SRL Vechi"); // neschimbat
    // "+373 (79) 11-22-334" → cifre "373791122334" → ultimele 8: "91122334"
    expect(updated.phoneNormalized).toBe("91122334");
  });
});

describe("POST/GET /api/crm/leads/:id/interactions", () => {
  it("adaugă o notă și o regăsește în istoric, ordonată occurredAt desc", async () => {
    const lead = await createLead();

    const res = await app.request(`/api/crm/leads/${lead.id}/interactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "note", body: "Client interesat de curs" }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.type).toBe("note");
    expect(created.userId).toBe(userA);

    const { items } = await (
      await app.request(`/api/crm/leads/${lead.id}/interactions`)
    ).json();
    expect(items.some((i: { body: string }) => i.body === "Client interesat de curs")).toBe(true);
  });
});

// ─── Produse — suspendate până apare migrarea `crm_products` ────────────────

describe.skipIf(!hasCrmProducts)("GET /api/crm/products — arhivare", () => {
  it("un produs arhivat nu mai apare în listă implicit, dar rămâne în bază", async () => {
    const created = await app.request("/api/crm/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Curs Engleză B2" }),
    });
    expect(created.status).toBe(201);
    const product = await created.json();

    const archiveRes = await app.request(`/api/crm/products/${product.id}/archive`, {
      method: "POST",
    });
    expect(archiveRes.status).toBe(200);
    expect((await archiveRes.json()).isActive).toBe(false);

    const defaultList = await (await app.request("/api/crm/products")).json();
    expect(defaultList.items.find((p: { id: string }) => p.id === product.id)).toBeUndefined();

    const fullList = await (await app.request("/api/crm/products?includeInactive=1")).json();
    const found = fullList.items.find((p: { id: string }) => p.id === product.id);
    expect(found).toBeTruthy();
    expect(found.isActive).toBe(false);

    // Restore îl aduce înapoi în lista implicită.
    const restoreRes = await app.request(`/api/crm/products/${product.id}/restore`, {
      method: "POST",
    });
    expect(restoreRes.status).toBe(200);
    const afterRestore = await (await app.request("/api/crm/products")).json();
    expect(afterRestore.items.find((p: { id: string }) => p.id === product.id)).toBeTruthy();
  });
});

describe.skipIf(!hasCrmProducts)("POST /api/crm/products — unicitate SKU", () => {
  it("două produse din același tenant nu pot avea același SKU", async () => {
    const first = await app.request("/api/crm/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Curs Python", sku: "PY-101" }),
    });
    expect(first.status).toBe(201);

    const second = await app.request("/api/crm/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Curs Python Avansat", sku: "PY-101" }),
    });
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("sku_taken");

    // Dar același SKU e liber pentru alt tenant — unicitatea e per tenant, nu globală.
    currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bogdan@test-b.md" };
    const otherTenant = await app.request("/api/crm/products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Curs Python (tenant B)", sku: "PY-101" }),
    });
    expect(otherTenant.status).toBe(201);
  });
});
