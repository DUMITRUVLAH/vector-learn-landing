/**
 * VF-302: approver delegation helpers.
 * While a delegation X→Y is active (now in [startsAt, endsAt], active=true), Y may decide the
 * approval steps assigned to X.
 */
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "../../db/client";
import { parDelegations, parMembers, parProjectMembers } from "../../db/schema/par";

/**
 * Returns the set of user ids who have an ACTIVE delegation to `toUserId` right now.
 * i.e. the "principals" whose assigned steps `toUserId` is currently allowed to act on.
 */
export async function getActiveDelegators(
  toUserId: string,
  tenantId: string,
  now: Date = new Date()
): Promise<Set<string>> {
  const rows = await db
    .select({ fromUserId: parDelegations.fromUserId })
    .from(parDelegations)
    .where(
      and(
        eq(parDelegations.tenantId, tenantId),
        eq(parDelegations.toUserId, toUserId),
        eq(parDelegations.active, true),
        lte(parDelegations.startsAt, now),
        gte(parDelegations.endsAt, now)
      )
    );
  return new Set(rows.map((r) => r.fromUserId));
}

/**
 * VM1-07: reverse lookup — the user ids currently delegated BY `fromUserId` (X→Y active now).
 * Used to route approval emails to the delegate too, not just the (possibly absent) assignee.
 */
export async function getActiveDelegatesOf(
  fromUserId: string,
  tenantId: string,
  now: Date = new Date()
): Promise<string[]> {
  const rows = await db
    .select({ toUserId: parDelegations.toUserId })
    .from(parDelegations)
    .where(
      and(
        eq(parDelegations.tenantId, tenantId),
        eq(parDelegations.fromUserId, fromUserId),
        eq(parDelegations.active, true),
        lte(parDelegations.startsAt, now),
        gte(parDelegations.endsAt, now)
      )
    );
  return [...new Set(rows.map((r) => r.toUserId))];
}

/** True if `toUserId` may act on a step assigned to `assignedUserId` (self, or via active delegation). */
export async function canActViaDelegation(
  toUserId: string,
  assignedUserId: string | null,
  tenantId: string,
  now: Date = new Date()
): Promise<boolean> {
  if (!assignedUserId) return false;
  if (assignedUserId === toUserId) return true;
  const delegators = await getActiveDelegators(toUserId, tenantId, now);
  return delegators.has(assignedUserId);
}

/**
 * The authority a delegate INHERITS from their active delegators.
 *
 * A delegation used to reach only steps pinned to a person (`approverUserId === X`). But the
 * default DOA chain is role-based (`approverUserId = null`, "any approver"), so "I'm away — Mihai
 * signs for me" changed nothing: the delegate saw the queue and got 403 on every decision. What is
 * being handed over is the delegator's *authority*, so the delegate inherits their PAR roles for
 * the delegation window — and, for project-scoped chains, their project access.
 *
 * Returns an empty authority when there is no active delegation, so callers can pass it
 * unconditionally.
 */
export async function getDelegatedAuthority(
  delegators: Set<string>,
  tenantId: string,
  projectId: string | null | undefined
): Promise<{ roles: string[]; allowedOnProject: boolean }> {
  const ids = [...delegators];
  if (ids.length === 0) return { roles: [], allowedOnProject: false };

  const memberRows = await db
    .select({ role: parMembers.role, userId: parMembers.userId })
    .from(parMembers)
    .where(and(eq(parMembers.tenantId, tenantId), inArray(parMembers.userId, ids)));
  const roles = [...new Set(memberRows.map((r) => r.role))];

  // No project on the PAR (or no designated-approver restriction) → scoping is decided by the
  // caller's own `allowedOnProject`; here we only answer "is a delegator on this project?".
  if (!projectId) return { roles, allowedOnProject: true };
  const projectRows = await db
    .select({ userId: parProjectMembers.userId })
    .from(parProjectMembers)
    .where(and(
      eq(parProjectMembers.tenantId, tenantId),
      eq(parProjectMembers.projectId, projectId),
      inArray(parProjectMembers.userId, ids),
    ));
  return { roles, allowedOnProject: projectRows.length > 0 };
}
