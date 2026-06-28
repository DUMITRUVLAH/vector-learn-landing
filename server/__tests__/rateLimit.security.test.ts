/**
 * @vitest-environment node
 * SEC-02 — durable login rate limiter.
 *
 * Drives the REAL rateLimit functions against a PGlite-backed login_attempts table and asserts:
 *  - the 6th failure within the window locks the bucket (429 territory) with a Retry-After,
 *  - a successful auth (clearRateLimit) resets the bucket,
 *  - a missing table fails OPEN (never locks users out on deploy lag).
 * Test the action: we invoke recordFailure/checkRateLimit, not just assert a control renders.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";

let pg: PGlite;
let testDb: ReturnType<typeof drizzle>;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
}));

async function createTable() {
  await pg.exec(`
    CREATE TABLE login_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      attempt_key varchar(320) NOT NULL UNIQUE,
      count integer NOT NULL DEFAULT 0,
      window_start timestamptz NOT NULL DEFAULT now(),
      locked_until timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

beforeAll(async () => {
  pg = new PGlite();
  testDb = drizzle(pg);
  await createTable();
});

afterAll(async () => {
  await pg?.close();
});

describe("SEC-02: durable login rate limiter", () => {
  it("T-SEC-02-1 [blocant] locks the bucket after max failures, with a Retry-After", async () => {
    const { checkRateLimit, recordFailure, rateLimitKey, LOGIN_RATE_LIMIT } = await import("../lib/rateLimit");
    const key = rateLimitKey("brute@evil.test", "1.2.3.4");

    // Before any failure: not limited.
    expect((await checkRateLimit(key)).limited).toBe(false);

    // Record `max` failures.
    let last;
    for (let i = 0; i < LOGIN_RATE_LIMIT.max; i++) {
      last = await recordFailure(key);
    }
    // The max-th failure locks it.
    expect(last!.limited).toBe(true);
    expect(last!.retryAfterSec).toBeGreaterThan(0);

    // A subsequent check is also limited (the pre-verify gate would 429).
    const gate = await checkRateLimit(key);
    expect(gate.limited).toBe(true);
    expect(gate.retryAfterSec).toBeGreaterThan(0);
  });

  it("T-SEC-02-2 [blocant] a successful auth clears the bucket", async () => {
    const { checkRateLimit, recordFailure, clearRateLimit, rateLimitKey } = await import("../lib/rateLimit");
    const key = rateLimitKey("user@ok.test", "5.6.7.8");
    await recordFailure(key);
    await recordFailure(key);
    await clearRateLimit(key);
    const after = await checkRateLimit(key);
    expect(after.limited).toBe(false);
    expect(after.remaining).toBeGreaterThan(0);
  });

  it("T-SEC-02-3 [blocant] distinct keys are independent (different IPs not collateral-locked)", async () => {
    const { checkRateLimit, recordFailure, rateLimitKey, LOGIN_RATE_LIMIT } = await import("../lib/rateLimit");
    const victimKey = rateLimitKey("victim@corp.test", "9.9.9.9");
    const attackerKey = rateLimitKey("victim@corp.test", "6.6.6.6");
    for (let i = 0; i < LOGIN_RATE_LIMIT.max; i++) await recordFailure(attackerKey);
    expect((await checkRateLimit(attackerKey)).limited).toBe(true);
    // The legitimate user on a different IP is NOT locked.
    expect((await checkRateLimit(victimKey)).limited).toBe(false);
  });

  it("T-SEC-02-4 [normal] fails OPEN when the table is missing (deploy-lag safety)", async () => {
    const { checkRateLimit, recordFailure, rateLimitKey } = await import("../lib/rateLimit");
    await pg.exec(`DROP TABLE login_attempts;`);
    const key = rateLimitKey("x@y.test", "1.1.1.1");
    // No throw, and not limited — login must still work while the migration catches up.
    expect((await checkRateLimit(key)).limited).toBe(false);
    expect((await recordFailure(key)).limited).toBe(false);
    // restore for any later tests
    await createTable();
  });
});
