/**
 * Regression for the 2026-08-25 "PAR settings freeze" report: a dynamic import for a stale
 * chunk doesn't always reject fast — some network/CDN conditions leave it hanging, so the
 * Suspense fallback (a spinner) never goes away. lazyWithTimeout() forces a rejection after a
 * timeout so ErrorBoundary's stale-chunk auto-reload (already tested in ErrorBoundary.test.tsx)
 * still kicks in instead of the app looking frozen forever.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { lazyWithTimeout, raceWithTimeout } from "../lazyWithTimeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("raceWithTimeout", () => {
  it("passes through a promise that settles before the timeout", async () => {
    await expect(raceWithTimeout(Promise.resolve("ok"), 20_000, "timed out")).resolves.toBe("ok");
  });

  it("rejects with the given message once the timeout elapses, for a promise that never settles", async () => {
    vi.useFakeTimers();
    const neverSettles = new Promise<string>(() => {});
    const raced = raceWithTimeout(neverSettles, 20_000, "Failed to fetch dynamically imported module: timed out");

    const assertion = expect(raced).rejects.toThrow(
      "Failed to fetch dynamically imported module: timed out",
    );
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });
});

describe("lazyWithTimeout", () => {
  it("renders normally when the import resolves before the timeout", async () => {
    const Comp = lazyWithTimeout(() => Promise.resolve({ default: () => <div>loaded</div> }));
    render(
      <Suspense fallback={<div>loading</div>}>
        <Comp />
      </Suspense>,
    );
    await screen.findByText("loaded");
  });

  /**
   * Raport owner 2026-08-29: „Failed to fetch dynamically imported module … aceasta eroare este
   * mereu". Recuperarea trebuie să se întâmple AICI, la import, nu după ce eroarea urcă în
   * ErrorBoundary ca un crash de randare — altfel fiecare hash nou de chunk producea un email
   * „tip NOU de eroare" către owner pentru ceva ce se repară singur.
   */
  it("recuperează singur un chunk vechi, fără să lase eroarea să crape randarea", async () => {
    const recover = vi.fn().mockReturnValue(true);
    vi.doMock("../staleChunk", async (importOriginal) => ({
      ...(await importOriginal<typeof import("../staleChunk")>()),
      recoverFromStaleChunk: recover,
    }));
    vi.resetModules();
    const { lazyWithTimeout: freshLazy } = await import("../lazyWithTimeout");

    const Comp = freshLazy(() =>
      Promise.reject(
        new Error(
          "Failed to fetch dynamically imported module: https://www.finflow.best/assets/ParDashboard-Cvn9ANnH.js",
        ),
      ),
    );
    render(
      <Suspense fallback={<div>loading</div>}>
        <Comp />
      </Suspense>,
    );

    await vi.waitFor(() => expect(recover).toHaveBeenCalledTimes(1));
    // Recuperarea a pornit reload-ul: rămânem pe fallback, fără flash de eroare până se reîncarcă.
    expect(screen.getByText("loading")).toBeTruthy();

    vi.doUnmock("../staleChunk");
    vi.resetModules();
  });
});
