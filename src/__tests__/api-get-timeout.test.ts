/**
 * Regresie pentru „Consola Platformă → Workspace-uri rămâne pe «Se încarcă…»" (2026-08-28).
 *
 * `GET /api/platform/workspaces` răspundea în 260 ms pe prod, iar tabul tot nu se încărca:
 * `fetch` nu are timeout implicit, deci o cerere agățată (rețea moartă, laptop trezit din somn)
 * nu respinge NICIODATĂ promisiunea — și fiecare ecran care face `finally { setLoading(false) }`
 * rămâne blocat pe spinner, fără cale de ieșire în afară de reîncărcarea paginii.
 *
 * Testul pică pe codul vechi (promisiunea nu se rezolvă niciodată → timeout de test) și trece
 * pe cel nou (GET-ul e abandonat și aruncă `request_timeout`).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError, GET_TIMEOUT_MS } from "@/lib/api";

vi.mock("@/lib/telemetry", () => ({ reportClientError: vi.fn() }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Un fetch care nu răspunde niciodată, dar respectă `signal` — exact ca un socket agățat. */
function hangingFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit = {}) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
          );
        })
    ) as unknown as typeof fetch
  );
}

describe("api() — limita de timp pe GET", () => {
  it("abandonează un GET agățat și aruncă request_timeout", async () => {
    vi.useFakeTimers();
    hangingFetch();

    const pending = api("/api/platform/workspaces");
    const assertion = expect(pending).rejects.toMatchObject({ code: "request_timeout" });

    await vi.advanceTimersByTimeAsync(GET_TIMEOUT_MS + 1);
    await assertion;
  });

  it("nu impune limita când apelantul își aduce propriul signal", async () => {
    vi.useFakeTimers();
    hangingFetch();

    const controller = new AbortController();
    const pending = api("/api/x", { signal: controller.signal });
    const assertion = expect(pending).rejects.toThrow();

    await vi.advanceTimersByTimeAsync(GET_TIMEOUT_MS + 5_000);
    controller.abort(); // doar abandonul cerut explicit oprește cererea
    await assertion;
  });

  it("nu pune limită pe mutații (pot dura legitim minute)", async () => {
    vi.useFakeTimers();
    const seen: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit = {}) => {
        seen.push(init);
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }) as unknown as typeof fetch
    );

    await api("/api/x", { method: "POST", body: "{}" });
    expect(seen[0].signal).toBeUndefined();
  });
});

describe("api() — o singură reîncercare la eșec tranzitoriu", () => {
  it("reia GET-ul după 503 server_timeout și întoarce rezultatul reușit", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return calls === 1
          ? { ok: false, status: 503, json: async () => ({ error: "server_timeout" }) }
          : { ok: true, status: 200, json: async () => ({ workspaces: [{ id: "w1" }] }) };
      }) as unknown as typeof fetch
    );

    await expect(api("/api/platform/workspaces")).resolves.toEqual({ workspaces: [{ id: "w1" }] });
    expect(calls).toBe(2);
  });

  it("nu reîncearcă la erori definitive (403) — ar ascunde problema reală", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return { ok: false, status: 403, json: async () => ({ error: "platform_admin_required" }) };
      }) as unknown as typeof fetch
    );

    await expect(api("/api/platform/workspaces")).rejects.toMatchObject({
      code: "platform_admin_required",
    });
    expect(calls).toBe(1);
  });

  it("dă drumul erorii dacă și reîncercarea pică", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: "server_timeout" }) })) as unknown as typeof fetch
    );
    await expect(api("/api/x")).rejects.toMatchObject({ code: "server_timeout" });
  });
});

describe("ApiError", () => {
  it("expune codul de timeout ca instanță ApiError", () => {
    const e = new ApiError(0, "request_timeout");
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe("request_timeout");
  });
});
