/**
 * @vitest-environment node
 *
 * Coduri bugetare în valută — /usage și /:id/balance pe o bază PGlite reală.
 *
 * De ce există: alocarea unei linii de buget poate fi în EUR/USD (bugetul unui grant), în timp ce
 * cererile de plată sunt însumate în lei. Dacă cele două s-ar compara direct, un plafon de
 * 10.000 EUR ar fi citit ca 10.000 MDL — de ~20× mai mic — și fiecare cerere ar apărea ca
 * „buget depășit". Testele blochează conversia (curs BNM) și comportamentul când cursul lipsește.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parBudgetCodes, parPayerModules, parPayers, parRequests } from "../db/schema/par";
import { __primeFxRate, __resetFxCache } from "../lib/fx";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let payerId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "admin", email: "violeta@atic.md" });
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

const EUR_RATE = 19.5;

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

/** O linie de buget, cu alocarea în moneda ei. */
async function budgetCode(code: string, allocatedCents: number, currency: string) {
  const [row] = await testDb
    .insert(parBudgetCodes)
    .values({ tenantId, payerId, code, name: `Linia ${code}`, allocatedCents, currency })
    .returning();
  return row;
}

/** O cerere trimisă spre aprobare (stare „angajată"), în moneda ei. */
async function committedRequest(
  budgetCodeId: string,
  opts: { totalEstimatedCents: number; currency: string; totalMdlCents?: number }
) {
  await testDb.insert(parRequests).values({
    tenantId,
    payerId,
    requestNo: `PAR-${Math.random().toString(36).slice(2, 8)}`,
    requestedByUserId: userId,
    budgetCodeId,
    status: "pending_approval",
    currency: opts.currency,
    totalEstimatedCents: opts.totalEstimatedCents,
    totalMdlCents: opts.totalMdlCents ?? null,
  });
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parBudgetCodesRoutes } = await import("../routes/parBudgetCodes");
  app = new Hono();
  app.route("/api/par/budget-codes", parBudgetCodesRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-buget-valuta" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "violeta@atic.md", passwordHash: "x", name: "Violeta", role: "admin" })
    .returning();
  userId = u.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(parRequests).where(eq(parRequests.tenantId, tenantId));
  await testDb.delete(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
  __resetFxCache();
  __primeFxRate("EUR", EUR_RATE);
  // Niciun apel real la BNM din teste: cursurile de care avem nevoie sunt puse în cache mai sus,
  // iar restul trebuie să se comporte exact ca atunci când BNM nu răspunde.
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network disabled in tests"); }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/par/budget-codes/:id/balance — alocare în valută", () => {
  it("[blocant] convertește alocarea în lei înainte de a o compara cu cheltuielile", async () => {
    const code = await budgetCode("1.1", 1_000_00, "EUR"); // 1.000 EUR
    await committedRequest(code.id, { totalEstimatedCents: 5_000_00, currency: "MDL" }); // 5.000 MDL

    const res = await app.request(`/api/par/budget-codes/${code.id}/balance`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.currency).toBe("EUR");
    expect(body.allocatedOriginalCents).toBe(1_000_00);
    expect(body.allocatedCents).toBe(Math.round(1_000_00 * EUR_RATE)); // 19.500 MDL
    expect(body.committedCents).toBe(5_000_00);
    expect(body.availableCents).toBe(Math.round(1_000_00 * EUR_RATE) - 5_000_00);
    // …și restul exprimat înapoi în moneda liniei, pentru afișare.
    expect(body.availableOriginalCents).toBe(Math.round((Math.round(1_000_00 * EUR_RATE) - 5_000_00) / EUR_RATE));
    expect(body.fxUnavailable).toBe(false);
  });

  it("[blocant] o cerere în EUR intră în consum cu echivalentul ei în lei, nu cu cifra brută", async () => {
    const code = await budgetCode("1.2", 100_000_00, "MDL"); // 100.000 MDL
    // 1.000 EUR trimiși = 19.500 MDL. Fără totalMdlCents s-ar număra 1.000 MDL (de 19,5× mai puțin).
    await committedRequest(code.id, { totalEstimatedCents: 1_000_00, currency: "EUR", totalMdlCents: 19_500_00 });

    const body = await (await app.request(`/api/par/budget-codes/${code.id}/balance`)).json();
    expect(body.committedCents).toBe(19_500_00);
    expect(body.availableCents).toBe(100_000_00 - 19_500_00);
  });

  it("fără curs BNM nu inventează un plafon — raportează fxUnavailable", async () => {
    __resetFxCache(); // niciun curs cunoscut, iar BNM nu este apelat cu succes în test
    const code = await budgetCode("1.3", 1_000_00, "USD");

    const body = await (await app.request(`/api/par/budget-codes/${code.id}/balance`)).json();
    expect(body.fxUnavailable).toBe(true);
    expect(body.allocatedCents).toBe(0); // 0 = „fără plafon comparabil", nu „buget zero"
    expect(body.allocatedOriginalCents).toBe(1_000_00);
  }, 20_000);

  it("întoarce cursul monedei cerute prin ?currency=, ca formularul să-și convertească totalul", async () => {
    const code = await budgetCode("1.4", 10_000_00, "MDL");
    const body = await (await app.request(`/api/par/budget-codes/${code.id}/balance?currency=EUR`)).json();
    expect(body.requestRate).toBe(EUR_RATE);
  });
});

describe("GET /api/par/budget-codes/usage — consum pe toate liniile", () => {
  it("[blocant] procentul folosit se calculează pe alocarea convertită în lei", async () => {
    const code = await budgetCode("2.1", 1_000_00, "EUR"); // 19.500 MDL
    await committedRequest(code.id, { totalEstimatedCents: 9_750_00, currency: "MDL" }); // jumătate

    const body = await (await app.request("/api/par/budget-codes/usage")).json();
    const row = body.usage.find((u: { code: string }) => u.code === "2.1");
    expect(row.currency).toBe("EUR");
    expect(row.allocatedOriginalCents).toBe(1_000_00);
    expect(row.usedPct).toBe(50);
    expect(row.fxUnavailable).toBe(false);
  });

  it("linia în lei rămâne exact ca înainte (fără conversie, fără curs)", async () => {
    const code = await budgetCode("2.2", 10_000_00, "MDL");
    await committedRequest(code.id, { totalEstimatedCents: 2_500_00, currency: "MDL" });

    const body = await (await app.request("/api/par/budget-codes/usage")).json();
    const row = body.usage.find((u: { code: string }) => u.code === "2.2");
    expect(row.currency).toBe("MDL");
    expect(row.rate).toBe(1);
    expect(row.allocatedCents).toBe(10_000_00);
    expect(row.usedPct).toBe(25);
  });
});

describe("POST / PATCH /api/par/budget-codes — moneda liniei", () => {
  it("[blocant] salvează moneda aleasă și o poate schimba ulterior", async () => {
    const created = await app.request("/api/par/budget-codes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "3.1", name: "Salarii", allocatedCents: 30_735_28, currency: "EUR", payer_id: payerId }),
    });
    expect(created.status).toBe(201);
    const row = await created.json();
    expect(row.currency).toBe("EUR");

    const patched = await app.request(`/api/par/budget-codes/${row.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currency: "USD" }),
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).currency).toBe("USD");
  });

  it("fără valută explicită, o linie nouă rămâne în lei", async () => {
    const created = await app.request("/api/par/budget-codes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "3.2", name: "Consumabile", allocatedCents: 5_000_00, payer_id: payerId }),
    });
    expect((await created.json()).currency).toBe("MDL");
  });
});
