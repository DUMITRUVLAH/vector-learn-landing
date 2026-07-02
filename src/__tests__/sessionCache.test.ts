/**
 * Sidebar caching: the shell remounts on every navigation and used to re-fetch identity/roles
 * (a visible loading flash + a request per click). These tests lock the cache behavior that
 * makes remounts instant and quiet.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cachedOnce, peekResolved, clearSessionCache, invalidateSessionCache } from "@/lib/sessionCache";

beforeEach(() => clearSessionCache());

describe("sessionCache", () => {
  it("[blocant] calls the fetcher ONCE across repeated calls (no re-query on every nav)", async () => {
    let calls = 0;
    const fn = async () => { calls++; return { role: "admin" }; };
    const a = await cachedOnce("k", fn);
    const b = await cachedOnce("k", fn);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });

  it("[blocant] peekResolved returns the value synchronously after resolve (kills the flash)", async () => {
    expect(peekResolved("k")).toBeUndefined(); // pending/absent
    await cachedOnce("k", async () => 42);
    expect(peekResolved<number>("k")).toBe(42);
  });

  it("[blocant] does NOT cache a rejection — next call retries", async () => {
    let calls = 0;
    const fn = async () => { calls++; if (calls === 1) throw new Error("boom"); return "ok"; };
    await expect(cachedOnce("k", fn)).rejects.toThrow("boom");
    const second = await cachedOnce("k", fn);
    expect(second).toBe("ok");
    expect(calls).toBe(2);
  });

  it("clearSessionCache drops everything (logout → next user re-fetches)", async () => {
    await cachedOnce("k", async () => "v");
    expect(peekResolved("k")).toBe("v");
    clearSessionCache();
    expect(peekResolved("k")).toBeUndefined();
  });

  it("invalidateSessionCache drops one key", async () => {
    await cachedOnce("a", async () => 1);
    await cachedOnce("b", async () => 2);
    invalidateSessionCache("a");
    expect(peekResolved("a")).toBeUndefined();
    expect(peekResolved("b")).toBe(2);
  });

  it("respects TTL (expired entry is re-fetched)", async () => {
    let calls = 0;
    const fn = async () => { calls++; return calls; };
    await cachedOnce("k", fn, 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 5));
    await cachedOnce("k", fn, 1);
    expect(calls).toBe(2);
  });
});
