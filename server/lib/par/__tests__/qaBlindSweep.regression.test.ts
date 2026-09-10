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
import { stepMatchesViewer, pickDecidableStep, type DecidableStep, type ViewerContext } from "../decisionAuthority";

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

describe("parallel level — an approver signs their OWN slot, not a colleague's", () => {
  // Live on PAR-2026-0025: two parallel slots labelled with people's names. Ana was the requestor,
  // so submit nulled her pinned user id and her slot became role-based; Irina approved and the
  // route's `find` handed her Ana's row — the form then read "15. ANA CHIRITA / Irina Oriol" while
  // Irina's own row stayed "În așteptare".
  const anaSlotDeassigned: DecidableStep = {
    id: "ana", step: 1, decision: "pending", locked: false,
    approverUserId: null, approverParRole: "approver", approverRoleLabel: "Aprobator",
  };
  const irinaSlot: DecidableStep = {
    id: "irina", step: 1, decision: "pending", locked: false,
    approverUserId: "irina-id", approverParRole: null, approverRoleLabel: "Irina Oriol",
  };
  const irina: ViewerContext = {
    userId: "irina-id", parRoles: ["approver"], delegators: new Set(), allowedOnProject: true,
  };

  it("picks the pinned row even when the open row comes first", () => {
    expect(pickDecidableStep([anaSlotDeassigned, irinaSlot], irina, { locked: false })?.id).toBe("irina");
  });

  it("falls back to the open row for an approver who has no slot of their own", () => {
    const other: ViewerContext = { ...irina, userId: "other-approver" };
    expect(pickDecidableStep([anaSlotDeassigned, irinaSlot], other, { locked: false })?.id).toBe("ana");
  });

  it("prefers a delegator's pinned row over an open one, but never over my own", () => {
    const delegate: ViewerContext = {
      ...irina, userId: "delegate", delegators: new Set(["irina-id"]),
    };
    expect(pickDecidableStep([anaSlotDeassigned, irinaSlot], delegate, { locked: false })?.id).toBe("irina");
    const mine: DecidableStep = { ...anaSlotDeassigned, id: "mine", approverUserId: "delegate" };
    expect(pickDecidableStep([irinaSlot, mine], delegate, { locked: false })?.id).toBe("mine");
  });

  it("still takes the earliest sequential step when nothing is pinned to me", () => {
    const second: DecidableStep = { ...anaSlotDeassigned, id: "s2", step: 2 };
    expect(pickDecidableStep([second, anaSlotDeassigned], irina, { locked: false })?.id).toBe("ana");
  });

  it("never returns a locked row to the unlocked picker", () => {
    const locked: DecidableStep = { ...irinaSlot, locked: true };
    expect(pickDecidableStep([locked], irina, { locked: false })).toBeUndefined();
    expect(pickDecidableStep([locked], irina, { locked: true })?.id).toBe("irina");
  });
});
