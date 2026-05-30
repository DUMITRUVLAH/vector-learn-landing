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
import type { AuthVariables } from "./requireAuth";

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
