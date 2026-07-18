/**
 * @vitest-environment node
 * PARQA-008: DOA ceiling enforcement (blocksOnApprovalLimit).
 *
 * Locks the decision that a role-based approver cannot be the FINAL signature on an amount above
 * their personal ceiling (backlog test: "aprobator cu plafon 5.000 pe cerere 7.000 → nu poate
 * încheia singur"), while intermediate steps and par_admin stay unrestricted.
 */
import { describe, it, expect } from "vitest";
import { blocksOnApprovalLimit } from "../approvalLimit";

describe("PARQA-008 blocksOnApprovalLimit", () => {
  const base = { isFinalApproval: true, isParAdmin: false, approverLimitCents: 500000, amountMdlCents: 300000 };

  it("blocks the final signature when amount exceeds the approver's ceiling (5000 limit, 7000 PAR)", () => {
    expect(blocksOnApprovalLimit({ ...base, approverLimitCents: 500000, amountMdlCents: 700000 })).toBe(true);
  });

  it("allows the final signature when amount is within the ceiling", () => {
    expect(blocksOnApprovalLimit({ ...base, approverLimitCents: 500000, amountMdlCents: 500000 })).toBe(false);
    expect(blocksOnApprovalLimit({ ...base, approverLimitCents: 500000, amountMdlCents: 400000 })).toBe(false);
  });

  it("never limits an intermediate step (a higher approver still follows)", () => {
    expect(
      blocksOnApprovalLimit({ isFinalApproval: false, isParAdmin: false, approverLimitCents: 500000, amountMdlCents: 700000 })
    ).toBe(false);
  });

  it("never limits par_admin (the escalation authority is unlimited)", () => {
    expect(
      blocksOnApprovalLimit({ isFinalApproval: true, isParAdmin: true, approverLimitCents: 500000, amountMdlCents: 9_000_000 })
    ).toBe(false);
  });

  it("treats a null ceiling as unlimited", () => {
    expect(
      blocksOnApprovalLimit({ isFinalApproval: true, isParAdmin: false, approverLimitCents: null, amountMdlCents: 9_000_000 })
    ).toBe(false);
  });

  it("boundary: exactly at the ceiling is allowed (strictly greater blocks)", () => {
    expect(blocksOnApprovalLimit({ ...base, approverLimitCents: 700000, amountMdlCents: 700000 })).toBe(false);
    expect(blocksOnApprovalLimit({ ...base, approverLimitCents: 700000, amountMdlCents: 700001 })).toBe(true);
  });
});
