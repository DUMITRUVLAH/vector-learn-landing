/**
 * BRANCH-703 — Branch scope middleware
 *
 * Extracts `branch_scope` from the authenticated user.
 * When set, all downstream route handlers must restrict data
 * to the specified branch (enforced per-route via applyBranchScope helper).
 *
 * Usage:
 *   import { getBranchScope } from "../middleware/branchScope";
 *   const scope = getBranchScope(c); // returns UUID or null
 *   if (scope) conditions.push(eq(table.branchId, scope));
 */
import type { Context } from "hono";
import { eq } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import type { AuthVariables } from "./requireAuth";
import type { User } from "../db/schema";

/**
 * Returns the branch_scope UUID for the authenticated user, or null if the user
 * has access to all branches (owner/admin with NULL branch_scope).
 */
export function getBranchScope(
  c: Context<{ Variables: AuthVariables }>
): string | null {
  const user = c.get("user");
  return user.branchScope ?? null;
}

/**
 * BRANCH-703: Push an eq(column, branchScope) condition if the user has a branch scope.
 * Use this in route handlers to enforce branch-level data isolation.
 *
 * Usage:
 *   withBranchFilter(user, conditions, table.branchId);
 */
export function withBranchFilter(
  user: User,
  conditions: ReturnType<typeof eq>[],
  column: AnyColumn
): void {
  if (user.branchScope) {
    conditions.push(eq(column, user.branchScope));
  }
}
