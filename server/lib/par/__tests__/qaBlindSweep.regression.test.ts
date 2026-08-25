/**
 * Regressions locked in by the 336-scenario blind sweep (scripts/e2e-par-blind-150.mjs).
 *
 * Each block below is a bug that reached the running app; the e2e proves the endpoint behaves,
 * these keep the *rule* honest in CI without a server (CLAUDE.md §3.5.1quater — a fix without a
 * test that locks it is half a fix).
 */
import { describe, it, expect } from "vitest";
import { MAX_MONEY_CENTS, MAX_LINE_QUANTITY, exceedsMoneyBound } from "../moneyBounds";
import { normalizeIban, isValidMoldovaIBAN } from "../validators";
import { isWorkspaceAdminRole } from "../roles";
import { stepMatchesViewer, type DecidableStep, type ViewerContext } from "../decisionAuthority";

describe("money bounds — an out-of-range amount is a 400, not an integer-overflow 500", () => {
  it("accepts an amount that fits the integer money column", () => {
    expect(exceedsMoneyBound(700_000)).toBe(false);
    expect(exceedsMoneyBound(MAX_MONEY_CENTS)).toBe(false);
  });

  it("rejects the qty × price product that used to blow up the INSERT", () => {
    // The live 500 was: POST /line-items {quantity: 1000, unit_price_cents: 99999999}
    // → 'value "99999999000" is out of range for type integer'.
    expect(exceedsMoneyBound(1000 * 99_999_999)).toBe(true);
  });

  it("rejects non-integer and unsafe values", () => {
    expect(exceedsMoneyBound(10.5)).toBe(true);
    expect(exceedsMoneyBound(Number.MAX_SAFE_INTEGER + 2)).toBe(true);
  });

  it("keeps a realistic donor-funded request well inside the ceiling", () => {
    // 21.4M MDL — no single PAR in the source workflow comes close.
    expect(MAX_MONEY_CENTS / 100).toBeGreaterThan(21_000_000);
    expect(MAX_LINE_QUANTITY).toBeGreaterThanOrEqual(1_000_000);
  });
});

describe("IBAN storage — the pasted form must not reach the bank file", () => {
  it("strips the grouping spaces a user pastes from a bank statement", () => {
    expect(normalizeIban("MD24 AG00 0225 1000 1310 4168")).toBe("MD24AG000225100013104168");
  });

  it("upper-cases the account number", () => {
    expect(normalizeIban("md24ag000225100013104168")).toBe("MD24AG000225100013104168");
  });

  it("validates the spaced and the canonical form identically", () => {
    expect(isValidMoldovaIBAN("MD24 AG00 0225 1000 1310 4168")).toBe(true);
    expect(isValidMoldovaIBAN(normalizeIban("MD24 AG00 0225 1000 1310 4168"))).toBe(true);
  });
});

describe("draft privacy — an unsubmitted request stays with its author", () => {
  it("treats workspace admins and managers as the support-level view", () => {
    expect(isWorkspaceAdminRole("admin")).toBe(true);
    expect(isWorkspaceAdminRole("manager")).toBe(true);
  });

  it("does not grant the support view to an ordinary workspace member", () => {
    expect(isWorkspaceAdminRole("teacher")).toBe(false);
    expect(isWorkspaceAdminRole(null)).toBe(false);
    expect(isWorkspaceAdminRole(undefined)).toBe(false);
  });
});

describe("delegation — 'sign for me while I'm away' must reach role-based steps", () => {
  const roleStep: DecidableStep = {
    id: "s1", step: 1, decision: "pending", locked: false,
    approverUserId: null, approverParRole: null, approverRoleLabel: "DOA Holder",
  };
  const financeStep: DecidableStep = { ...roleStep, id: "s2", approverParRole: "finance" };
  const base: ViewerContext = {
    userId: "delegate", parRoles: [], delegators: new Set(["holder"]),
    allowedOnProject: false,
  };

  it("lets the delegate decide a step their delegator's role covered", () => {
    expect(stepMatchesViewer(roleStep, {
      ...base, delegatedRoles: ["approver"], delegatedAllowedOnProject: true,
    })).toBe(true);
  });

  it("still refuses a step the delegator's role never covered", () => {
    expect(stepMatchesViewer(financeStep, {
      ...base, delegatedRoles: ["approver"], delegatedAllowedOnProject: true,
    })).toBe(false);
  });

  it("refuses when the delegator is not allowed on the PAR's project", () => {
    expect(stepMatchesViewer(roleStep, {
      ...base, delegatedRoles: ["approver"], delegatedAllowedOnProject: false,
    })).toBe(false);
  });

  it("refuses when there is no active delegation at all", () => {
    expect(stepMatchesViewer(roleStep, { ...base, delegators: new Set(), delegatedRoles: [] })).toBe(false);
  });

  it("keeps the pinned-step delegation working", () => {
    expect(stepMatchesViewer(
      { ...roleStep, approverUserId: "holder" },
      { ...base, delegatedRoles: [], delegatedAllowedOnProject: false }
    )).toBe(true);
  });

  it("does not let a delegated par_admin bypass the project scope check", () => {
    expect(stepMatchesViewer(financeStep, {
      ...base, delegatedRoles: ["par_admin"], delegatedAllowedOnProject: false,
    })).toBe(false);
  });
});
