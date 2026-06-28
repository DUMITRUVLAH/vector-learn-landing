/**
 * Project-scoped approvers — the pure decision function. Default-open: a PAR with no project, or a
 * project with no designated approvers, is approvable by ANY approver. A restricted project only its
 * designated approvers. (Backs the inbox filter + the approve permission in parApprovals.ts.)
 */
import { describe, it, expect } from "vitest";
import { projectAllowsApprover } from "../projectApprovers";

describe("projectAllowsApprover", () => {
  it("PAR with no project → any approver", () => {
    expect(projectAllowsApprover(null, "u1", undefined)).toBe(true);
    expect(projectAllowsApprover(undefined, "u1", new Set(["u2"]))).toBe(true);
  });

  it("project with no designated approvers → any approver (unrestricted)", () => {
    expect(projectAllowsApprover("p1", "u1", undefined)).toBe(true);
    expect(projectAllowsApprover("p1", "u1", new Set())).toBe(true);
  });

  it("restricted project → ONLY its designated approvers", () => {
    const designated = new Set(["u1", "u2"]);
    expect(projectAllowsApprover("p1", "u1", designated)).toBe(true);
    expect(projectAllowsApprover("p1", "u2", designated)).toBe(true);
    expect(projectAllowsApprover("p1", "u3", designated)).toBe(false); // not designated → blocked
  });
});
