/**
 * Regresie PLATFORM-404 — „Consola Platformă se încarcă la nesfârșit" (prod, 2026-08-28).
 *
 * Măsurat pe prod: ~4 din 50 de invocări logau `<-- GET …` și nu mai răspundeau NICIODATĂ
 * (504 FUNCTION_INVOCATION_TIMEOUT), în timp ce fiecare răspuns reușit venea sub 3 s. O
 * interogare al cărei răspuns nu mai vine ținea invocația până o omora Vercel, iar în interfață
 * TOATE cererile tabului rămâneau agățate simultan.
 *
 * Plafonul transformă „niciodată" într-un 503 tratabil. Testul pică fără middleware (cererea nu
 * se termină → timeout de test) și trece cu el.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { Hono } from "hono";
import { getTimeout, API_GET_TIMEOUT_MS } from "../middleware/getTimeout";

afterEach(() => vi.useRealTimers());

function appWith(handler: () => Promise<Response>) {
  const app = new Hono();
  app.use("/api/*", getTimeout);
  app.get("/api/hang", handler);
  app.post("/api/hang", handler);
  return app;
}

describe("getTimeout — plafon pe GET /api/*", () => {
  it("întoarce 503 server_timeout când handler-ul nu mai răspunde", async () => {
    vi.useFakeTimers();
    const app = appWith(() => new Promise<Response>(() => { /* nu se termină niciodată */ }));

    const pending = app.request("/api/hang");
    await vi.advanceTimersByTimeAsync(API_GET_TIMEOUT_MS + 10);
    const res = await pending;

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("1");
    await expect(res.json()).resolves.toMatchObject({ error: "server_timeout", path: "/api/hang" });
  });

  it("nu atinge un GET care răspunde la timp", async () => {
    const app = appWith(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const res = await app.request("/api/hang");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("NU plafonează mutațiile — pot dura legitim minute (AI, PDF, import)", async () => {
    vi.useFakeTimers();
    let release!: (r: Response) => void;
    const app = appWith(() => new Promise<Response>((r) => { release = r; }));

    const pending = app.request("/api/hang", { method: "POST" });
    await vi.advanceTimersByTimeAsync(API_GET_TIMEOUT_MS * 3);
    release(new Response(JSON.stringify({ done: true }), { status: 200 }));

    const res = await pending;
    expect(res.status).toBe(200);
  });
});
