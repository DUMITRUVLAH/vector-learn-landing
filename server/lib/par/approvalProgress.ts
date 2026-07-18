export type PendingApprovalStep = {
  id: string;
  step: number;
  decision: string;
  locked: boolean;
};

export type ApprovalProgress =
  | { state: "awaiting_parallel"; currentStep: number; remainingIds: string[] }
  | { state: "advance"; nextStep: number; unlockIds: string[] }
  | { state: "complete" };

/** Pure approval-chain transition used after one active row is approved. */
export function approvalProgressAfterDecision(
  steps: PendingApprovalStep[],
  approvedId: string,
): ApprovalProgress {
  const approved = steps.find((step) => step.id === approvedId);
  if (!approved) throw new Error("approved_step_not_found");
  const parallelSiblings = steps.filter((step) =>
    step.id !== approvedId && step.step === approved.step && step.decision === "pending"
  );
  if (parallelSiblings.length) {
    return { state: "awaiting_parallel", currentStep: approved.step, remainingIds: parallelSiblings.map((step) => step.id) };
  }
  const nextStep = steps
    .filter((step) => step.step > approved.step && step.decision === "pending" && step.locked)
    .reduce<number | null>((min, step) => min === null || step.step < min ? step.step : min, null);
  if (nextStep === null) return { state: "complete" };
  return {
    state: "advance",
    nextStep,
    unlockIds: steps.filter((step) => step.step === nextStep && step.decision === "pending" && step.locked).map((step) => step.id),
  };
}
