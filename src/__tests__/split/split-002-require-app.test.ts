/**
 * SPLIT-002: requireApp middleware tests
 * Tests that cross-app access is rejected with 403 wrong_app.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB to avoid PGlite in this unit test
vi.mock("../../../server/db/client", () => ({
  db: {
    query: {
      tenants: {
        findFirst: vi.fn(),
      },
    },
  },
}));

import { db } from "../../../server/db/client";
import { requireApp } from "../../../server/middleware/requireApp";

type MockFn = ReturnType<typeof vi.fn>;

function makeContext(user: { id: string; tenantId: string } | null, vars: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = { ...vars };
  if (user) store["user"] = user;
  return {
    get: (k: string) => store[k],
    set: (k: string, v: unknown) => { store[k] = v; },
    json: (body: unknown, status?: number) => ({ body, status: status ?? 200 }),
    req: {},
    _store: store,
  };
}

describe("SPLIT-002 — requireApp middleware", () => {
  const learnUser = { id: "user-1", tenantId: "tenant-learn" };
  const businessUser = { id: "user-2", tenantId: "tenant-biz" };

  const learnTenant = { id: "tenant-learn", appKind: "learn", name: "CRM Demo" };
  const businessTenant = { id: "tenant-biz", appKind: "business", name: "Biz Demo" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-SPLIT-002-1 [blocant] — learn user accessing business app gets 403 wrong_app", async () => {
    (db.query.tenants.findFirst as MockFn).mockResolvedValueOnce(learnTenant);

    const ctx = makeContext(learnUser);
    const mw = requireApp("business");
    const next = vi.fn();

    const result = await mw(ctx as never, next);
    expect((result as { status: number }).status).toBe(403);
    expect((result as { body: { error: string } }).body.error).toBe("wrong_app");
    expect(next).not.toHaveBeenCalled();
  });

  it("T-SPLIT-002-2 [blocant] — business user accessing business app calls next()", async () => {
    (db.query.tenants.findFirst as MockFn).mockResolvedValueOnce(businessTenant);

    const ctx = makeContext(businessUser);
    const mw = requireApp("business");
    const next = vi.fn();

    await mw(ctx as never, next);
    expect(next).toHaveBeenCalled();
  });

  it("T-SPLIT-002-3 [blocant] — no user in context returns 401", async () => {
    const ctx = makeContext(null);
    const mw = requireApp("business");
    const next = vi.fn();

    const result = await mw(ctx as never, next);
    expect((result as { status: number }).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("T-SPLIT-002-4 [normal] — after requireApp, tenant is cached on context", async () => {
    (db.query.tenants.findFirst as MockFn).mockResolvedValueOnce(businessTenant);

    const ctx = makeContext(businessUser);
    const mw = requireApp("business");
    await mw(ctx as never, vi.fn());

    expect((ctx as unknown as { _store: Record<string, unknown> })._store["tenant"]).toEqual(businessTenant);
  });

  it("learn user CAN access learn app", async () => {
    (db.query.tenants.findFirst as MockFn).mockResolvedValueOnce(learnTenant);

    const ctx = makeContext(learnUser);
    const mw = requireApp("learn");
    const next = vi.fn();

    await mw(ctx as never, next);
    expect(next).toHaveBeenCalled();
  });
});
