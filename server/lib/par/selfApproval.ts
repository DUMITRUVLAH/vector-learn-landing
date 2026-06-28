/**
 * SEC-04 — segregation of duties for PAR approvals.
 *
 * The requestor of a PAR must never be able to advance their own request toward payment —
 * not by approving an assigned step, and NOT when a step fell back to role routing because
 * they happen to also hold the approver / par_admin role (the case the original guard missed).
 * A sole-admin tenant could otherwise submit → approve → pay entirely alone.
 *
 * Pure predicate so it's unit-testable and reused by every decision path (approve, reapprove).
 * See PAR-CORE.md §324 and blocking test T-PAR-107-3.
 */
export function isSelfApproval(
  requestedByUserId: string | null | undefined,
  actingUserId: string,
): boolean {
  return !!requestedByUserId && requestedByUserId === actingUserId;
}
