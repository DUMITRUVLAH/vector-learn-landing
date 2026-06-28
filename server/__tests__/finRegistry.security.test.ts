/**
 * @vitest-environment node
 * SEC-01 — finRegistry tenant-isolation regression tests.
 *
 * The bug: GET/POST tax-rates and GET chart-of-accounts resolved tenantId from the REQUEST
 * (query param / body), so any authenticated user could read another tenant's fiscal config
 * and any admin could write a tax rate into a victim tenant. The fix forces tenantId to come
 * from the session ONLY.
 *
 * These tests mount the REAL route handlers on a fresh Hono app, inject a chosen authenticated
 * user (so we don't depend on the cookie/session layer), and exercise the endpoints against a
 * real in-memory PGlite DB seeded with TWO tenants. They assert the actual data isolation —
 * not just that a control renders (CLAUDE.md §3.5.1quater: test the action).
 *
 * They FAIL on the old code (client tenantId honored) and PASS on the fix.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Hono } from "hono";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";

let pg: PGlite;
let testDb: ReturnType<typeof drizzle>;
let app: Hono;
let userTenant = TENANT_A;

// Point the route's `db` import at our PGlite instance (lazy getter — testDb is assigned in beforeAll).
vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
}));

// Admit our injected user through requireAuth without the real cookie/session layer.
vi.mock("../auth/session", () => ({
  SESSION_COOKIE: "vl_session",
  getSessionUser: async () => ({
    user: { id: "u1", tenantId: userTenant, role: "owner", isActive: true },
    sessionToken: "test",
  }),
}));

beforeAll(async () => {
  pg = new PGlite();
  testDb = drizzle(pg);

  // Minimal schema for the two registry tables (mirrors server/db/schema/finRegistry.ts columns
  // the route touches). Enums are represented as text to keep the test self-contained.
  await pg.exec(`
    CREATE TABLE fin_tax_rates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid,
      country char(2) NOT NULL,
      kind text NOT NULL,
      name text NOT NULL,
      rate_pct numeric NOT NULL,
      effective_from date NOT NULL,
      effective_to date,
      is_default boolean DEFAULT false,
      notes text,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );
    CREATE TABLE fin_chart_of_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid,
      country char(2) NOT NULL,
      account_code text NOT NULL,
      account_name text NOT NULL,
      account_type text NOT NULL DEFAULT 'asset',
      parent_code text,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    );
  `);

  // Seed: one global rate, one per tenant.
  await pg.exec(`
    INSERT INTO fin_tax_rates (tenant_id, country, kind, name, rate_pct, effective_from) VALUES
      (NULL, 'MD', 'vat', 'Global VAT 20', '20', '2020-01-01'),
      ('${TENANT_A}', 'MD', 'vat', 'A custom VAT', '8', '2024-01-01'),
      ('${TENANT_B}', 'MD', 'vat', 'B custom VAT', '12', '2024-01-01');
    INSERT INTO fin_chart_of_accounts (tenant_id, country, account_code, account_name, account_type) VALUES
      (NULL, 'MD', '1000', 'Global cash', 'asset'),
      ('${TENANT_A}', 'MD', '2000', 'A receivables', 'asset'),
      ('${TENANT_B}', 'MD', '2000', 'B receivables', 'asset');
  `);

  // Import the real router AFTER the db + session mocks are in place. requireAuth admits our
  // user via the mocked getSessionUser (which reads the live `userTenant` per request).
  const { finRegistryRoutes } = await import("../routes/finRegistry");
  app = new Hono();
  app.route("/api/fin/registry", finRegistryRoutes);
});

afterAll(async () => {
  await pg?.close();
});

function req(path: string, init?: RequestInit) {
  return app.request(path, {
    ...init,
    headers: { cookie: "vl_session=test", "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

describe("SEC-01: finRegistry tax-rates tenant isolation", () => {
  it("T-SEC-01-1 [blocant] GET /tax-rates?tenantId=<B> returns ONLY tenant A's + global rows (param ignored)", async () => {
    userTenant = TENANT_A;
    const res = await req(`/api/fin/registry/tax-rates?tenantId=${TENANT_B}`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { name: string; tenantId: string | null }[] };
    const names = data.map((r) => r.name).sort();
    // Must include global + A; must NOT include B's row despite the ?tenantId=B param.
    expect(names).toContain("Global VAT 20");
    expect(names).toContain("A custom VAT");
    expect(names).not.toContain("B custom VAT");
  });

  it("T-SEC-01-2 [blocant] GET /tax-rates/:id of another tenant's row → 404", async () => {
    userTenant = TENANT_B;
    // Find B's own id first (allowed), then switch to A and try to read it.
    const own = await req(`/api/fin/registry/tax-rates`);
    const { data } = (await own.json()) as { data: { id: string; name: string }[] };
    const bRow = data.find((r) => r.name === "B custom VAT")!;
    expect(bRow).toBeTruthy();

    userTenant = TENANT_A;
    const res = await req(`/api/fin/registry/tax-rates/${bRow.id}`);
    expect(res.status).toBe(404);
  });

  it("T-SEC-01-3 [normal] GET /tax-rates/:id of a global row → 200 (global is shared)", async () => {
    userTenant = TENANT_A;
    const list = await req(`/api/fin/registry/tax-rates`);
    const { data } = (await list.json()) as { data: { id: string; name: string }[] };
    const globalRow = data.find((r) => r.name === "Global VAT 20")!;
    const res = await req(`/api/fin/registry/tax-rates/${globalRow.id}`);
    expect(res.status).toBe(200);
  });

  it("T-SEC-01-4 [blocant] POST /tax-rates with body.tenantId=<B> creates the row under A (session tenant)", async () => {
    userTenant = TENANT_A;
    const res = await req(`/api/fin/registry/tax-rates`, {
      method: "POST",
      body: JSON.stringify({
        tenantId: TENANT_B, // attacker-supplied — must be ignored
        country: "MD",
        kind: "vat",
        name: "Poisoned rate",
        ratePct: "99",
        effectiveFrom: "2025-01-01",
      }),
    });
    expect(res.status).toBe(201);
    const { data } = (await res.json()) as { data: { tenantId: string } };
    expect(data.tenantId).toBe(TENANT_A);
    expect(data.tenantId).not.toBe(TENANT_B);

    // And B must NOT see the poisoned rate.
    userTenant = TENANT_B;
    const bList = await req(`/api/fin/registry/tax-rates`);
    const { data: bData } = (await bList.json()) as { data: { name: string }[] };
    expect(bData.map((r) => r.name)).not.toContain("Poisoned rate");
  });
});

describe("SEC-01: finRegistry chart-of-accounts tenant isolation", () => {
  it("T-SEC-01-5 [blocant] GET /chart-of-accounts?tenantId=<B> returns ONLY A's + global (param ignored)", async () => {
    userTenant = TENANT_A;
    const res = await req(`/api/fin/registry/chart-of-accounts?tenantId=${TENANT_B}`);
    expect(res.status).toBe(200);
    const { data } = (await res.json()) as { data: { accountName: string }[] };
    const names = data.map((r) => r.accountName);
    expect(names).toContain("Global cash");
    expect(names).toContain("A receivables");
    expect(names).not.toContain("B receivables");
  });
});
