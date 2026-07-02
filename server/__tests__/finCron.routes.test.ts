/**
 * @vitest-environment node
 * AUTOBILL: cron route auth — the cross-tenant endpoint MUST reject anything without the secret.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Isolate auth from the billing engine — assert only that the guard gates the call.
const runAutoBilling = vi.fn(async () => ({ processed: 0, billed: 0, skipped: 0, errors: 0, outcomes: [] }));
vi.mock("../lib/fin/autoBillRunner", () => ({ runAutoBilling: (...a: unknown[]) => runAutoBilling(...a) }));
vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: "u", tenantId: "t", role: "admin", email: "a@a.md" });
    await next();
  },
}));

import { finCronRoutes } from "../routes/finCron";
import { Hono } from "hono";
const app = new Hono();
app.route("/api/fin/cron", finCronRoutes);

beforeEach(() => { runAutoBilling.mockClear(); delete process.env.CRON_SECRET; });

describe("AUTOBILL: GET /api/fin/cron/run-recurring auth", () => {
  it("[blocant] 503 when CRON_SECRET is not configured (never runs open)", async () => {
    const res = await app.request("/api/fin/cron/run-recurring");
    expect(res.status).toBe(503);
    expect(runAutoBilling).not.toHaveBeenCalled();
  });

  it("[blocant] 401 without the correct Bearer secret", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const noHeader = await app.request("/api/fin/cron/run-recurring");
    expect(noHeader.status).toBe(401);
    const wrong = await app.request("/api/fin/cron/run-recurring", { headers: { authorization: "Bearer nope" } });
    expect(wrong.status).toBe(401);
    expect(runAutoBilling).not.toHaveBeenCalled();
  });

  it("[blocant] 200 + runs cross-tenant with the correct secret", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await app.request("/api/fin/cron/run-recurring", { headers: { authorization: "Bearer s3cr3t" } });
    expect(res.status).toBe(200);
    expect(runAutoBilling).toHaveBeenCalledTimes(1);
    expect(runAutoBilling).toHaveBeenCalledWith(); // no tenant arg → all tenants
  });

  it("[blocant] POST /run-now runs scoped to the caller's tenant", async () => {
    const res = await app.request("/api/fin/cron/run-now", { method: "POST" });
    expect(res.status).toBe(200);
    expect(runAutoBilling).toHaveBeenCalledWith({ tenantId: "t" });
  });
});
