/**
 * @vitest-environment node
 * SEC-04 — self-approval segregation of duties.
 *
 * Unit-tests the pure predicate AND a static guard that the approval route actually invokes it
 * BEFORE deciding the step (so a refactor can't silently drop the check). The full
 * requestor-who-is-also-approver flow is exercised end-to-end by scripts/e2e-par-100.mjs
 * (scenario "requestor-with-approver-role approve own PAR → 403").
 */
import { describe, it, expect } from "vitest";
import { isSelfApproval } from "../selfApproval";

describe("SEC-04: isSelfApproval predicate (T-PAR-107-3)", () => {
  it("[blocant] requestor acting on their own PAR → true (blocked)", () => {
    expect(isSelfApproval("user-1", "user-1")).toBe(true);
  });
  it("[blocant] a different approver → false (allowed)", () => {
    expect(isSelfApproval("user-1", "user-2")).toBe(false);
  });
  it("[normal] null/undefined requestor → false (no requestor recorded)", () => {
    expect(isSelfApproval(null, "user-1")).toBe(false);
    expect(isSelfApproval(undefined, "user-1")).toBe(false);
  });
});

describe("SEC-04: approval route enforces the self-approval guard (static)", () => {
  it("[blocant] parApprovals.ts calls isSelfApproval and returns self_approval_forbidden", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(path.resolve(__dirname, "../../../routes/parApprovals.ts"), "utf-8");
    expect(src).toContain("isSelfApproval(");
    expect(src).toContain("self_approval_forbidden");
    // The guard must sit in approveParStep — appear after the function declaration.
    const fnIdx = src.indexOf("async function approveParStep");
    const guardIdx = src.indexOf("isSelfApproval(", fnIdx);
    expect(fnIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(fnIdx);
  });
});
