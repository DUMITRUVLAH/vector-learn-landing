/**
 * Regresie pentru cauza-rădăcină a raportului „eroarea asta e mereu" (2026-08-29).
 *
 * `public/sw.js` nu e importat de aplicație (rulează în worker), deci nimic nu-l verifica.
 * Testul îl încarcă într-un `self` fals și verifică cele două reguli fără de care cache-ul se
 * otrăvește iar:
 *   • `/assets/*` (module cu hash) nu trec deloc prin service worker;
 *   • niciun răspuns HTML nu e cache-uit sau servit sub un URL de fișier.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

interface FetchEventLike {
  request: { url: string; method: string; mode: string };
  respondWith: (r: unknown) => void;
}
type FetchHandler = (event: FetchEventLike) => void;

let fetchHandler: FetchHandler;
const cacheStore = new Map<string, Response>();
const putSpy = vi.fn();
const deleteSpy = vi.fn();

function htmlResponse(): Response {
  return new Response("<!doctype html><html></html>", {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

beforeAll(async () => {
  const source = readFileSync(path.resolve(process.cwd(), "public/sw.js"), "utf8");

  const handlers: Record<string, (event: unknown) => void> = {};
  const fakeCache = {
    put: async (req: unknown, res: Response) => {
      putSpy(typeof req === "string" ? req : (req as { url: string }).url);
      cacheStore.set(typeof req === "string" ? req : (req as { url: string }).url, res);
    },
    delete: async (req: unknown) => {
      deleteSpy(typeof req === "string" ? req : (req as { url: string }).url);
      return true;
    },
    addAll: async () => undefined,
  };
  const fakeCaches = {
    open: async () => fakeCache,
    keys: async () => [],
    delete: async () => true,
    match: async (req: unknown) =>
      cacheStore.get(typeof req === "string" ? req : (req as { url: string }).url),
  };
  const fakeSelf = {
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      handlers[type] = fn;
    },
    location: { origin: "https://www.finflow.best" },
    skipWaiting: () => undefined,
    clients: { claim: () => undefined },
  };

  // Rulăm sursa reală a worker-ului cu `self`/`caches` injectate.
  const run = new Function("self", "caches", "fetch", "Response", "URL", source);
  // `fetch` e trecut ca wrapper, nu ca referință directă: worker-ul trebuie să vadă spy-ul pe care
  // fiecare test îl pune pe `globalThis.fetch` DUPĂ încărcare.
  run(fakeSelf, fakeCaches, (...args: Parameters<typeof globalThis.fetch>) => globalThis.fetch(...args), Response, URL);
  fetchHandler = handlers.fetch as unknown as FetchHandler;
});

describe("service worker", () => {
  it("nu atinge deloc modulele cu hash din /assets/", () => {
    const respondWith = vi.fn();
    fetchHandler({
      request: {
        url: "https://www.finflow.best/assets/ParDashboard-Cvn9ANnH.js",
        method: "GET",
        mode: "cors",
      },
      respondWith,
    });
    // Nicio intermediere = imposibil să servească vreodată HTML în locul modulului.
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("nu servește o intrare HTML otrăvită pentru un fișier — o șterge și merge la rețea", async () => {
    const url = "https://www.finflow.best/finflow-mark.png";
    cacheStore.set(url, htmlResponse());
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("PNG", { status: 200, headers: { "content-type": "image/png" } }),
      );

    let served: Promise<Response> | undefined;
    fetchHandler({
      request: { url, method: "GET", mode: "no-cors" },
      respondWith: (r) => {
        served = r as Promise<Response>;
      },
    });
    const response = await served!;

    expect(await response.text()).toBe("PNG");
    expect(deleteSpy).toHaveBeenCalledWith(url);
    network.mockRestore();
  });

  it("nu cache-uiește un răspuns HTML sub un URL de fișier", async () => {
    putSpy.mockClear();
    const url = "https://www.finflow.best/manifest.json";
    const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(htmlResponse());

    let served: Promise<Response> | undefined;
    fetchHandler({
      request: { url, method: "GET", mode: "no-cors" },
      respondWith: (r) => {
        served = r as Promise<Response>;
      },
    });
    await served!;

    expect(putSpy).not.toHaveBeenCalled();
    network.mockRestore();
  });
});
