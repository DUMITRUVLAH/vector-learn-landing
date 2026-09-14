/**
 * @vitest-environment node
 *
 * CRM Faza 1+2 — Leads/Pipeline + Produse + Etape de pâlnie, pe o bază PGlite reală (migrările
 * chiar rulate, nu un mock peste tabele).
 *
 * Testele de PRODUSE se auto-suspendă (`describe.skipIf`) dacă `crm_products` nu există încă în
 * migrările replay-uite la momentul rulării — schema/migrarea sunt livrate separat, în paralel;
 * nu inventăm tabela aici, doar așteptăm ca ea să apară pe branch.
 *
 * tenantA/tenantB (mai jos) primesc cele 5 etape implicite chiar în `beforeAll`, ca niște
 * workspace-uri care EXISTAU deja la migrarea 0162 — exact premisa pe care se bazează testele
 * mai vechi din fișier (scrise înainte de feature-ul de etape). Testele NOI pentru
 * `ensureTenantStages` își creează propriul tenant, fără nicio etapă, ca să verifice explicit
 * seed-ul lazy — vezi `createFreshTenant()`.
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
  const { crmStagesRoutes } = await import("../routes/crmStages");
  app = new Hono();
  app.route("/api/crm/leads", crmLeadsRoutes);
  app.route("/api/crm/stages", crmStagesRoutes);

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

  // tenantA/tenantB reprezintă workspace-uri EXISTENTE — la fel ca migrarea 0162, care a semănat
  // cele 5 etape implicite pentru orice tenant existent la acel moment. `GET /api/crm/stages`
  // seamănă lazy (ensureTenantStages) dacă tenantul n-are încă nicio etapă, deci un singur apel
  // aici e suficient ca să le dea acest set clasic — pe care testele mai vechi din fișier
  // (scrise înainte de feature-ul de etape) îl presupun implicit.
  currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "andreea@test-a.md" };
  await app.request("/api/crm/stages");
  currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bogdan@test-b.md" };
  await app.request("/api/crm/stages");
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

// ─── Helpere pentru testele de etape (crm_pipeline_stages) ───────────────────

let freshTenantSeq = 0;

/**
 * Un tenant NOU, fără nicio etapă — spre deosebire de tenantA/tenantB (seed-uite în beforeAll ca
 * niște workspace-uri deja existente). Folosit de orice test care creează/redenumește/șterge/
 * reordonează etape, ca să nu polueze setul clasic de 5 pe care alte teste îl presupun.
 */
async function createFreshTenant(): Promise<{ tenantId: string; userId: string; email: string }> {
  freshTenantSeq += 1;
  const n = freshTenantSeq;
  const [t] = await testDb
    .insert(tenants)
    .values({ name: `CRM Stage Test ${n}`, slug: `crm-stage-test-${n}` })
    .returning();
  const email = `stage-test-${n}@test.md`;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId: t.id, email, passwordHash: "x", name: `Tester ${n}`, role: "admin" })
    .returning();
  return { tenantId: t.id, userId: u.id, email };
}

/** Comută `currentUser` (mock-ul de requireAuth) pe un tenant creat cu createFreshTenant(). */
function loginAs(tenant: { tenantId: string; userId: string; email: string }) {
  currentUser = { id: tenant.userId, tenantId: tenant.tenantId, role: "admin", email: tenant.email };
}

/** Creează o etapă ca tenantul/userul curent și întoarce rândul creat (201 garantat). */
async function createStage(overrides: Record<string, unknown> = {}) {
  const res = await app.request("/api/crm/stages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "Etapă de test", ...overrides }),
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

describe("Schemă în urma codului (producție)", () => {
  it("[blocant] o coloană lipsă pe `leads` NU dărâmă pipeline-ul — arată tabla goală", async () => {
    // Pe producție baza rămâne uneori în urma codului: migrările nu se aplică
    // fiabil acolo, iar `sync-schema` vindecă abia la deploy. Înainte de fixul
    // ăsta, o singură coloană lipsă transforma pagina într-un „internal_error"
    // roșu — exact ce a văzut ownerul pe finflow.best.
    currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "ana@test-a.md" };
    await pglite.exec(`ALTER TABLE "leads" DROP COLUMN IF EXISTS "deal_name"`);
    try {
      const res = await app.request("/api/crm/leads/pipeline");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.schemaLag).toBe(true);
      expect(body.totalValueCents).toBe(0);
      expect(Object.keys(body.grouped)).toHaveLength(5);
    } finally {
      await pglite.exec(`ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "deal_name" varchar(300)`);
    }
  });

  it("după ce coloana revine, pipeline-ul funcționează din nou normal", async () => {
    currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "ana@test-a.md" };
    const res = await app.request("/api/crm/leads/pipeline");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schemaLag).toBeUndefined();
  });
});

describe("Valori mari în pipeline", () => {
  it("[blocant] o pâlnie de miliarde nu mai dă „integer out of range”", async () => {
    // Bug-ul real de pe producție: `sum(value_cents)` întoarce BIGINT, iar codul
    // îl turna în `::int`. Orice workspace cu o valoare totală peste ~21 mil.
    // (2^31 de bani) dobora TOATĂ pagina de pipeline, nu doar o cifră.
    currentUser = { id: userA, tenantId: tenantA, role: "admin", email: "ana@test-a.md" };
    const big = 2_000_000_000; // 2 mld. de bani; două astfel de rânduri depășesc int4
    for (let i = 0; i < 2; i++) {
      const res = await app.request("/api/crm/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: `Contract mare ${i}`, valueCents: big }),
      });
      expect(res.status).toBe(201);
    }

    const res = await app.request("/api/crm/leads/pipeline");
    expect(res.status).toBe(200);
    const body = await res.json();
    // Suma trebuie să fie exactă, nu trunchiată sau întoarsă ca text.
    expect(typeof body.totalValueCents).toBe("number");
    expect(body.totalValueCents).toBeGreaterThanOrEqual(2 * big);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CRM Faza 2 — Etape de pâlnie (crm_pipeline_stages, /api/crm/stages)
// ═══════════════════════════════════════════════════════════════════════════

// ─── ensureTenantStages — seed lazy pentru un workspace fără etape ───────────

describe("ensureTenantStages — seed automat pentru un workspace fără etape", () => {
  it("[blocant] un workspace fără etape primește automat cele 5 implicite", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    const res = await app.request("/api/crm/stages");
    expect(res.status).toBe(200);
    const { items } = await res.json();

    expect(items).toHaveLength(5);
    expect(items.map((s: { key: string }) => s.key)).toEqual(["new", "contacted", "trial", "paid", "lost"]);
    expect(
      items.every((s: { isDefault: boolean; tenantId: string }) => s.isDefault && s.tenantId === fresh.tenantId)
    ).toBe(true);
    expect(items.find((s: { key: string }) => s.key === "paid").isWon).toBe(true);
    expect(items.find((s: { key: string }) => s.key === "lost").isLost).toBe(true);

    // Idempotent: a doua citire nu dublează etapele.
    const again = await (await app.request("/api/crm/stages")).json();
    expect(again.items).toHaveLength(5);
  });

  it("[blocant] /pipeline seamănă și el cele 5 etape pentru un workspace fără niciuna", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    const body = await (await app.request("/api/crm/leads/pipeline")).json();
    expect(body.stages).toHaveLength(5);
    expect(Object.keys(body.grouped)).toHaveLength(5);
    expect(body.stages.map((s: { key: string }) => s.key)).toEqual(["new", "contacted", "trial", "paid", "lost"]);
  });
});

// ─── POST / — creare ──────────────────────────────────────────────────────────

describe("POST /api/crm/stages", () => {
  it("cheia se derivă din etichetă (diacritice, spații) când nu e dată explicit", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    const stage = await createStage({ label: "Ofertă trimisă" });
    expect(stage.key).toBe("oferta_trimisa");
    expect(stage.label).toBe("Ofertă trimisă");
    expect(stage.isDefault).toBe(false);
    expect(stage.tenantId).toBe(fresh.tenantId);
  });

  it("o cheie deja folosită în tenant e refuzată cu 409 stage_key_taken", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    await createStage({ label: "Prima", key: "duplicat" });

    const second = await app.request("/api/crm/stages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "A doua", key: "duplicat" }),
    });
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("stage_key_taken");
  });
});

// ─── PATCH /:id — imuabilitatea cheii ─────────────────────────────────────────

describe("PATCH /api/crm/stages/:id", () => {
  it("cheia unei etape nu poate fi schimbată după creare", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    const created = await createStage({ label: "Negociere", key: "negociere" });

    const res = await app.request(`/api/crm/stages/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "alta_cheie" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("stage_key_immutable");

    const { items } = await (await app.request("/api/crm/stages")).json();
    expect(items.find((s: { id: string }) => s.id === created.id).key).toBe("negociere");
  });

  it("eticheta, culoarea și probabilitatea se pot schimba normal", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    const created = await createStage({ label: "Etapă inițială" });

    const res = await app.request(`/api/crm/stages/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Etapă redenumită", color: "mint", probabilityPct: 75 }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json();
    expect(updated.label).toBe("Etapă redenumită");
    expect(updated.color).toBe("mint");
    expect(updated.probabilityPct).toBe(75);
    expect(updated.key).toBe(created.key); // neschimbată
  });
});

// ─── POST /reorder ────────────────────────────────────────────────────────────

describe("POST /api/crm/stages/reorder", () => {
  it("reordonarea etapelor se reflectă în ordinea coloanelor din /pipeline", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    // GET seamănă (ensureTenantStages) și întoarce cele 5 implicite, în ordinea clasică.
    const { items } = await (await app.request("/api/crm/stages")).json();
    const reversedIds = [...items].reverse().map((s: { id: string }) => s.id);

    const res = await app.request("/api/crm/stages/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: reversedIds }),
    });
    expect(res.status).toBe(200);
    const { items: reordered } = await res.json();
    expect(reordered.map((s: { key: string }) => s.key)).toEqual(["lost", "paid", "trial", "contacted", "new"]);

    const pipeline = await (await app.request("/api/crm/leads/pipeline")).json();
    expect(pipeline.stages.map((s: { key: string }) => s.key)).toEqual([
      "lost",
      "paid",
      "trial",
      "contacted",
      "new",
    ]);
  });
});

// ─── DELETE /:id — nu orfanizează lead-uri, nu șterge etape implicite ────────

describe("DELETE /api/crm/stages/:id", () => {
  it("[blocant] o etapă cu lead-uri în ea nu poate fi ștearsă", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    // Etapă PERSONALIZATĂ (nu implicită) — ca testul să verifice STRICT regula „are lead-uri",
    // nu regula „e implicită" (o etapă implicită e oricum nedeletabilă, indiferent de lead-uri —
    // vezi testul de mai jos).
    const stage = await createStage({ label: "Ofertă în lucru" });
    await createLead({ stage: stage.key });

    const res = await app.request(`/api/crm/stages/${stage.id}`, { method: "DELETE" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("stage_not_empty");
    expect(body.leads).toBe(1);

    // Etapa n-a fost ștearsă de fapt.
    const { items: unchanged } = await (await app.request("/api/crm/stages")).json();
    expect(unchanged.find((s: { id: string }) => s.id === stage.id)).toBeTruthy();
  });

  it("o etapă implicită nu poate fi ștearsă, chiar dacă e goală", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    const { items } = await (await app.request("/api/crm/stages")).json();
    const contacted = items.find((s: { key: string }) => s.key === "contacted");

    const res = await app.request(`/api/crm/stages/${contacted.id}`, { method: "DELETE" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("stage_is_default");
  });

  it("o etapă personalizată, goală, se poate șterge", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    const created = await createStage({ label: "Etapă de test, ștearsă" });

    const res = await app.request(`/api/crm/stages/${created.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const { items } = await (await app.request("/api/crm/stages")).json();
    expect(items.find((s: { id: string }) => s.id === created.id)).toBeUndefined();
  });
});

// ─── Regula „motiv pierdere” — flagul is_lost, nu literalul "lost" ───────────

describe("Regula „motiv pierdere” urmărește flagul is_lost, nu cheia „lost”", () => {
  it("[blocant] o etapă personalizată cu is_lost=true cere motiv, deși cheia nu e „lost”", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    const customStage = await createStage({ label: "Anulat de client", isLost: true });
    expect(customStage.key).not.toBe("lost");
    expect(customStage.isLost).toBe(true);

    const lead = await createLead(); // implicit pe "new" — default de coloană, independent de etape

    const withoutReason = await app.request(`/api/crm/leads/${lead.id}/stage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: customStage.key }),
    });
    expect(withoutReason.status).toBe(400);
    expect((await withoutReason.json()).error).toBe("lost_reason_required");

    const withReason = await app.request(`/api/crm/leads/${lead.id}/stage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: customStage.key, lostReason: "Buget anulat" }),
    });
    expect(withReason.status).toBe(200);
    const updated = await withReason.json();
    expect(updated.stage).toBe(customStage.key);
    expect(updated.lostReason).toBe("Buget anulat");
  });

  it("schimbarea către o cheie de etapă inexistentă e refuzată cu 400 unknown_stage", async () => {
    const fresh = await createFreshTenant();
    loginAs(fresh);

    const lead = await createLead();
    const res = await app.request(`/api/crm/leads/${lead.id}/stage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "nu_exista" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("unknown_stage");
  });
});

// ─── Izolare multi-tenant — etape ─────────────────────────────────────────────

describe("Izolare multi-tenant — etape", () => {
  it("[blocant] o etapă dintr-un alt workspace nu e vizibilă și nu poate fi modificată", async () => {
    const tenantX = await createFreshTenant();
    const tenantY = await createFreshTenant();

    loginAs(tenantX);
    const stageX = await createStage({ label: "Etapă privată X" });

    loginAs(tenantY);

    const listY = await (await app.request("/api/crm/stages")).json();
    expect(listY.items.find((s: { id: string }) => s.id === stageX.id)).toBeUndefined();

    const patchRes = await app.request(`/api/crm/stages/${stageX.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "Furat" }),
    });
    expect(patchRes.status).toBe(404);

    const deleteRes = await app.request(`/api/crm/stages/${stageX.id}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(404);

    // Reordonarea din Y ignoră id-uri din X — nu dă eroare, dar nu le atinge.
    const reorderRes = await app.request("/api/crm/stages/reorder", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: [stageX.id] }),
    });
    expect(reorderRes.status).toBe(200);

    // Etapa X, văzută din tenantul ei, e neatinsă.
    loginAs(tenantX);
    const listX = await (await app.request("/api/crm/stages")).json();
    const found = listX.items.find((s: { id: string }) => s.id === stageX.id);
    expect(found.label).toBe("Etapă privată X");
  });
});

// ─── GET /:id/detail — lead + istoric + etapă, o singură cerere ─────────────

describe("GET /api/crm/leads/:id/detail", () => {
  it("întoarce leadul, istoricul lui și etapa curentă într-o singură cerere", async () => {
    const lead = await createLead({ fullName: "Client Detaliu" });

    await app.request(`/api/crm/leads/${lead.id}/stage`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: "contacted" }),
    });
    await app.request(`/api/crm/leads/${lead.id}/interactions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "note", body: "Notă pentru detaliu" }),
    });

    const res = await app.request(`/api/crm/leads/${lead.id}/detail`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.lead.id).toBe(lead.id);
    expect(body.lead.stage).toBe("contacted");
    expect(body.stage.key).toBe("contacted");
    expect(body.stage.label).toBe("Contactat");
    expect(body.interactions.some((i: { type: string }) => i.type === "stage_change")).toBe(true);
    expect(
      body.interactions.some(
        (i: { type: string; body: string }) => i.type === "note" && i.body === "Notă pentru detaliu"
      )
    ).toBe(true);
  });

  it("un lead dintr-un alt tenant întoarce 404", async () => {
    const lead = await createLead();
    currentUser = { id: userB, tenantId: tenantB, role: "admin", email: "bogdan@test-b.md" };
    const res = await app.request(`/api/crm/leads/${lead.id}/detail`);
    expect(res.status).toBe(404);
  });
});
