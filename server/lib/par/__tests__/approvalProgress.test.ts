import { describe, expect, it } from "vitest";
import { approvalProgressAfterDecision } from "../approvalProgress";

describe("parallel and sequential approval progression", () => {
  it("waits for every parallel approver before advancing", () => {
    const steps = [
      { id: "a", step: 1, decision: "pending", locked: false },
      { id: "b", step: 1, decision: "pending", locked: false },
      { id: "c", step: 2, decision: "pending", locked: true },
    ];
    expect(approvalProgressAfterDecision(steps, "a")).toEqual({
      state: "awaiting_parallel", currentStep: 1, remainingIds: ["b"],
    });
  });

  it("unlocks all approvers on the next parallel level", () => {
    const steps = [
      { id: "a", step: 1, decision: "approved", locked: false },
      { id: "b", step: 1, decision: "pending", locked: false },
      { id: "c", step: 2, decision: "pending", locked: true },
      { id: "d", step: 2, decision: "pending", locked: true },
    ];
    expect(approvalProgressAfterDecision(steps, "b")).toEqual({
      state: "advance", nextStep: 2, unlockIds: ["c", "d"],
    });
  });

  it("completes only when no parallel sibling or later step remains", () => {
    expect(approvalProgressAfterDecision([
      { id: "final", step: 2, decision: "pending", locked: false },
    ], "final")).toEqual({ state: "complete" });
  });
});
