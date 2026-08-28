/**
 * Regresie pentru relaxarea din 2026-08-28: limitarea de rată e sărită local, ca poarta E2E
 * (CLAUDE.md §3.5.1quinquies) să nu primească `429 too_many_attempts` după câteva rulări.
 *
 * Testul păzește exact granița care contează: clientul plătitor NU trebuie să piardă protecția.
 * Dacă cineva simplifică `skipLocalDev` la „nu suntem în producție", testul cu `x-forwarded-for`
 * pică — iar acela e cazul Vercel, unde proxy-ul pune mereu antetul.
 */
import { describe, it, expect, afterEach } from "vitest";
import type { Context } from "hono";
import { skipLocalDev } from "../middleware/rateLimit";

const ctx = (headers: Record<string, string> = {}) =>
  ({ req: { header: (n: string) => headers[n.toLowerCase()] } }) as unknown as Context;

const NODE_ENV = process.env.NODE_ENV;
const FORCE = process.env.RATE_LIMIT_FORCE;

afterEach(() => {
  process.env.NODE_ENV = NODE_ENV;
  if (FORCE === undefined) delete process.env.RATE_LIMIT_FORCE;
  else process.env.RATE_LIMIT_FORCE = FORCE;
});

describe("skipLocalDev", () => {
  it("sare limitarea pentru o cerere locală în dezvoltare", () => {
    process.env.NODE_ENV = "development";
    delete process.env.RATE_LIMIT_FORCE;
    expect(skipLocalDev(ctx())).toBe(true);
  });

  it("NU sare limitarea în producție", () => {
    process.env.NODE_ENV = "production";
    delete process.env.RATE_LIMIT_FORCE;
    expect(skipLocalDev(ctx())).toBe(false);
  });

  it("NU sare limitarea pentru o cerere prin proxy, chiar dacă NODE_ENV nu e producție", () => {
    // Cazul Vercel: dacă NODE_ENV ar fi configurat greșit, antetul de proxy rămâne plasa de siguranță.
    process.env.NODE_ENV = "development";
    delete process.env.RATE_LIMIT_FORCE;
    expect(skipLocalDev(ctx({ "x-forwarded-for": "203.0.113.7" }))).toBe(false);
    expect(skipLocalDev(ctx({ "x-real-ip": "203.0.113.7" }))).toBe(false);
  });

  it("RATE_LIMIT_FORCE=1 reactivează limitarea local", () => {
    process.env.NODE_ENV = "development";
    process.env.RATE_LIMIT_FORCE = "1";
    expect(skipLocalDev(ctx())).toBe(false);
  });
});
