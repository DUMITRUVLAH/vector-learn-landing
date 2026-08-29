/**
 * Regresie pentru raportul owner-ului din 2026-08-29: „Failed to fetch dynamically imported
 * module: …/ParDashboard-<hash>.js … aceasta eroare este mereu".
 *
 * „Mereu" venea din cache: service worker-ul păstrase HTML-ul fallback-ului SPA sub URL-ul
 * chunk-ului, deci reload-ul simplu reciteste exact răspunsul stricat. Recuperarea trebuie deci
 * să GOLEASCĂ cache-urile ÎNAINTE de reload — și să facă asta o singură dată per incident.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isStaleChunkError, recoverFromStaleChunk } from "../staleChunk";

describe("isStaleChunkError", () => {
  it("recunoaște formulările Chrome / Firefox / Safari și timeout-ul sintetic", () => {
    expect(
      isStaleChunkError(
        "Failed to fetch dynamically imported module: https://www.finflow.best/assets/ParDashboard-Cvn9ANnH.js",
      ),
    ).toBe(true);
    expect(isStaleChunkError("error loading dynamically imported module: https://x/y.js")).toBe(true);
    expect(isStaleChunkError("Importing a module script failed.")).toBe(true);
    expect(isStaleChunkError("Failed to fetch dynamically imported module: timed out")).toBe(true);
  });

  it("nu confundă un crash obișnuit cu un chunk vechi", () => {
    expect(isStaleChunkError("Cannot read properties of undefined (reading 'foo')")).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});

describe("recoverFromStaleChunk", () => {
  let reloadSpy: ReturnType<typeof vi.fn>;
  let deleted: string[];
  const originalLocation = window.location;

  beforeEach(() => {
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });
    deleted = [];
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(["vl-shell-v1", "vl-shell-v2"]),
        delete: vi.fn(async (key: string) => {
          deleted.push(key);
          return true;
        }),
      },
    });
    sessionStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    // @ts-expect-error — curățăm stub-ul de test
    delete globalThis.caches;
    vi.restoreAllMocks();
  });

  it("golește TOATE cache-urile și abia apoi reîncarcă", async () => {
    expect(recoverFromStaleChunk()).toBe(true);
    // Golirea e asincronă; reload-ul vine în `finally`, deci după ea.
    expect(reloadSpy).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
    expect(deleted).toEqual(["vl-shell-v1", "vl-shell-v2"]);
  });

  it("reîncarcă tot, chiar dacă golirea cache-ului eșuează", async () => {
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: { keys: vi.fn().mockRejectedValue(new Error("blocked")), delete: vi.fn() },
    });
    expect(recoverFromStaleChunk()).toBe(true);
    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
  });

  it("nu intră în buclă: a doua încercare în fereastra de răcire e refuzată", async () => {
    expect(recoverFromStaleChunk()).toBe(true);
    await vi.waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
    expect(recoverFromStaleChunk()).toBe(false);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
