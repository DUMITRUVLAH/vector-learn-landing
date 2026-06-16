/**
 * VF-302: approver delegation helpers.
 * While a delegation X→Y is active (now in [startsAt, endsAt], active=true), Y may decide the
 * approval steps assigned to X.
 */
import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../../db/client";
import { parDelegations } from "../../db/schema/par";

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
