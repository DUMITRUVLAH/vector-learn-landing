/**
 * Project-scoped approvers (VF-approval-scoping). A project may designate WHICH approvers can decide
 * its PARs. The pure `projectAllowsApprover` is the single decision point; the DB helpers feed it.
 *
 * Default-open rule: a project with NO designated approvers (or a PAR with no project) is approvable
 * by ANY approver — scoping only ever NARROWS, never blocks an unconfigured project. Explicit step
 * assignments (approverUserId === user) bypass this entirely; scoping applies only to role-based steps.
 */
import { db } from "../../db/client";
import { parProjectApprovers } from "../../db/schema/par";
import { and, eq } from "drizzle-orm";

/** Pure: may `userId` decide a ROLE-BASED step on a PAR whose project has `designated` approvers? */
export function projectAllowsApprover(
  projectId: string | null | undefined,
  userId: string,
  designated: Set<string> | undefined,
): boolean {
  if (!projectId) return true; // PAR has no project → any approver
  if (!designated || designated.size === 0) return true; // project not restricted → any approver
  return designated.has(userId);
}

/** True for "relation/table does not exist" — the table may lag the code on a fresh deploy. */
function isMissingTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /par_project_approvers.*does not exist|relation .*does not exist|no such table/i.test(msg);
}

/**
 * Map projectId → Set<approverUserId> for a tenant. Projects absent = unrestricted. If the table is
 * missing (migration lags the code deploy), return an EMPTY map → no scoping → any approver, instead
 * of 500-ing the inbox. Scoping is additive, so "table not there yet" safely means "not configured".
 */
export async function getProjectApproverMap(tenantId: string): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  try {
    const rows = await db
      .select({ projectId: parProjectApprovers.projectId, userId: parProjectApprovers.userId })
      .from(parProjectApprovers)
      .where(eq(parProjectApprovers.tenantId, tenantId));
    for (const r of rows) {
      let set = map.get(r.projectId);
      if (!set) { set = new Set(); map.set(r.projectId, set); }
      set.add(r.userId);
    }
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
  return map;
}

/** Designated approvers for a single project (empty set = unrestricted, incl. when the table lags). */
export async function getDesignatedApprovers(tenantId: string, projectId: string): Promise<Set<string>> {
  try {
    const rows = await db
      .select({ userId: parProjectApprovers.userId })
      .from(parProjectApprovers)
      .where(and(eq(parProjectApprovers.tenantId, tenantId), eq(parProjectApprovers.projectId, projectId)));
    return new Set(rows.map((r) => r.userId));
  } catch (err) {
    if (isMissingTable(err)) return new Set();
    throw err;
  }
}

/** Replace a project's full approver list (admin action). Deletes then inserts in one transaction. */
export async function setProjectApprovers(
  tenantId: string,
  projectId: string,
  userIds: string[],
): Promise<void> {
  const unique = [...new Set(userIds)];
  await db.transaction(async (tx) => {
    await tx
      .delete(parProjectApprovers)
      .where(and(eq(parProjectApprovers.tenantId, tenantId), eq(parProjectApprovers.projectId, projectId)));
    if (unique.length > 0) {
      await tx.insert(parProjectApprovers).values(
        unique.map((userId) => ({ tenantId, projectId, userId })),
      );
    }
  });
}
