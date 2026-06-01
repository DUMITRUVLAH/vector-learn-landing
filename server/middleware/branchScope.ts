/**
 * BRANCH-703 — Branch-scoped permissions helper
 *
 * withBranchFilter(user, conditions) applies an extra branch_id condition
 * when the authenticated user has branchScope set (i.e., they are a branch
 * manager restricted to a single branch). Global owners/admins (branchScope = null)
 * pass through unchanged.
 *
 * Usage:
 *   import { withBranchFilter } from "../middleware/branchScope";
 *   const conditions = [eq(students.tenantId, user.tenantId)];
 *   withBranchFilter(user, conditions, students.branchId);
 *   const rows = await db.select().from(students).where(and(...conditions));
 */

import { eq, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import type { User } from "../db/schema/users";

/**
 * Mutates the `conditions` array in-place, adding a branch_id filter when
 * the user has a non-null branchScope. Returns the same array for chaining.
 *
 * @param user        The authenticated user (from c.get("user")).
 * @param conditions  An array of SQL conditions to append to.
 * @param branchIdCol The `branch_id` column of the table being queried.
 */
export function withBranchFilter(
  user: User,
  conditions: SQL[],
  branchIdCol: AnyColumn
): SQL[] {
  if (user.branchScope !== null && user.branchScope !== undefined) {
    conditions.push(eq(branchIdCol, user.branchScope));
  }
  return conditions;
}
