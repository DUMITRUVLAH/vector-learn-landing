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
});
