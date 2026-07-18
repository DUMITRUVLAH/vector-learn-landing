/**
 * PARQA-008: Delegation-of-Authority ceiling enforcement (par_members.approval_limit_cents).
 *
 * The decision is a pure function so it can be locked by a fast unit test; the route
 * (server/routes/parApprovals.ts → approveParStep) supplies the live inputs and turns a
 * `true` into a 403 `over_approval_limit`.
 *
 * Rule: a role-based approver may sign INTERMEDIATE steps freely, but may NOT be the FINAL
 * signature on an amount above their personal ceiling — that must escalate to a higher step.
 * par_admin (explicit, or an implicit tenant admin/manager) is the escalation authority and is
 * never limited. A null ceiling means "no DOA limit set" = unlimited.
 *
 * The amount is compared in MDL minor units (the currency the DOA matrix + limits are expressed in).
 */
export interface ApprovalLimitInput {
  /** True when approving this step completes the chain (no locked step follows). */
  isFinalApproval: boolean;
  /** True when the acting user holds par_admin (explicit or implicit tenant admin/manager). */
  isParAdmin: boolean;
  /** The acting approver's personal ceiling in MDL minor units; null = unlimited. */
  approverLimitCents: number | null;
  /** The PAR total in MDL minor units (totalMdlCents, or totalEstimatedCents for MDL PARs). */
  amountMdlCents: number;
}

/**
 * Returns true if this approval must be BLOCKED because the acting approver would be the final
 * signature on an amount above their DOA ceiling.
 */
export function blocksOnApprovalLimit(input: ApprovalLimitInput): boolean {
  const { isFinalApproval, isParAdmin, approverLimitCents, amountMdlCents } = input;
  // Only the final signature is gated; intermediate approvers just move the chain along.
  if (!isFinalApproval) return false;
  // The escalation authority is never limited.
  if (isParAdmin) return false;
  // No ceiling configured → unlimited.
  if (approverLimitCents == null) return false;
  return amountMdlCents > approverLimitCents;
}
