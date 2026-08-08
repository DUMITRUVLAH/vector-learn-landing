/**
 * Regression for the 2026-08-08 deliverability incident: PAR e2e sweeps against the seeded
 * `@atic.demo.io` demo tenant pushed real Resend sends that hard-bounced on `finflow.best`.
 * These assertions fail on the old code path (guard absent → everything allowed).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { emailSendDecision, isUndeliverableRecipient } from "../lib/emailGuard";

const ENV_KEYS = ["NODE_ENV", "EMAIL_SEND_MODE", "EMAIL_ALLOWLIST"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isUndeliverableRecipient", () => {
  it("flags the seeded demo tenants", () => {
    expect(isUndeliverableRecipient("approver@atic.demo.io")).toBe(true);
    expect(isUndeliverableRecipient("andrei.m@demo.vectorlearn.io")).toBe(true);
    expect(isUndeliverableRecipient("office@techminds.demo.vectorlearn.io")).toBe(true);
  });

  it("flags RFC-reserved domains", () => {
    for (const a of ["a@foo.test", "a@foo.invalid", "a@example.com", "a@localhost"]) {
      expect(isUndeliverableRecipient(a), a).toBe(true);
    }
  });

  it("does not flag real addresses", () => {
    expect(isUndeliverableRecipient("vlahdumitru@gmail.com")).toBe(false);
    expect(isUndeliverableRecipient("cineva@atic.md")).toBe(false);
  });
});

describe("emailSendDecision", () => {
  it("blocks demo recipients even in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_SEND_MODE;
    delete process.env.EMAIL_ALLOWLIST;
    expect(emailSendDecision("approver@atic.demo.io").allowed).toBe(false);
  });

  it("blocks every send outside production unless explicitly enabled", () => {
    process.env.NODE_ENV = "development";
    delete process.env.EMAIL_SEND_MODE;
    delete process.env.EMAIL_ALLOWLIST;
    expect(emailSendDecision("vlahdumitru@gmail.com").allowed).toBe(false);

    process.env.EMAIL_SEND_MODE = "on";
    expect(emailSendDecision("vlahdumitru@gmail.com").allowed).toBe(true);
  });

  it("honours the kill switch and the allowlist in production", () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_SEND_MODE = "off";
    expect(emailSendDecision("vlahdumitru@gmail.com").allowed).toBe(false);

    delete process.env.EMAIL_SEND_MODE;
    process.env.EMAIL_ALLOWLIST = "atic.md, vlahdumitru@gmail.com";
    expect(emailSendDecision("vlahdumitru@gmail.com").allowed).toBe(true);
    expect(emailSendDecision("oricine@atic.md").allowed).toBe(true);
    expect(emailSendDecision("strain@altcineva.md").allowed).toBe(false);
  });

  it("allows normal production sends", () => {
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_SEND_MODE;
    delete process.env.EMAIL_ALLOWLIST;
    expect(emailSendDecision("client@atic.md").allowed).toBe(true);
  });
});
