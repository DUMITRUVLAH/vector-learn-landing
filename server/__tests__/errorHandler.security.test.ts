/**
 * @vitest-environment node
 * SEC-03 — global error handler must not leak raw error text to clients in production.
 *
 * The bug: app.onError returned `{ error: err.message }` unconditionally, exposing SQL
 * fragments, table/column names and fs paths to any client that triggered a 500.
 * The fix: opaque `{ error: "internal_error" }` in production; the message only in dev.
 *
 * We don't import the full app (it pulls in the DB + 56 routers); instead we reconstruct the
 * exact onError handler the app installs and assert its behavior per NODE_ENV. The handler
 * logic is duplicated here verbatim from server/app.ts — if that logic changes, this test
 * documents the contract that must hold.
 */
import { describe, it, expect } from "vitest";
import { Hono } from "hono";

function buildAppWithErrorHandler(isProd: boolean) {
  const app = new Hono();
  app.onError((err, c) => {
    return c.json(isProd ? { error: "internal_error" } : { error: err.message }, 500);
  });
  app.get("/boom", () => {
    throw new Error("relation \"fin_tax_rates\" does not exist at /var/task/server/db");
  });
  return app;
}

describe("SEC-03: error handler does not leak internals in production", () => {
  it("T-SEC-03-1 [blocant] prod 500 body is opaque (no SQL/path/message)", async () => {
    const app = buildAppWithErrorHandler(true);
    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("internal_error");
    expect(body.error).not.toContain("fin_tax_rates");
    expect(body.error).not.toContain("/var/task");
    expect(body.error).not.toContain("relation");
  });

  it("T-SEC-03-2 [normal] dev 500 body still includes the message for debugging", async () => {
    const app = buildAppWithErrorHandler(false);
    const res = await app.request("/boom");
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("fin_tax_rates");
  });

  it("T-SEC-03-3 [blocant] the real app.ts uses NODE_ENV-gated opaque error (static guard)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(__dirname, "../app.ts"), "utf-8");
    // onError must branch on prod and emit the opaque body — never an unconditional err.message.
    expect(src).toContain('{ error: "internal_error" }');
    expect(src).not.toMatch(/return c\.json\(\s*\{\s*error:\s*err\.message\s*\}\s*,\s*500\s*\)/);
  });
});
