/**
 * SPLIT-201: ITPark role helper
 *
 * ITPark uses tenant-scoped roles stored on the tenant_users / users table.
 * For this app all authenticated users of a "business" tenant with ITPark access
 * are treated as allowed. The "accountant" role check here simply verifies the user
 * is authenticated and belongs to a tenant — no separate ITPark role table exists.
 *
 * Usage (function form, not middleware):
 *   const deny = await requireItparkRole("accountant", c);
 *   if (deny) return deny;
 *
 * Returns null if allowed, or a Response if denied.
 */

import type { Context } from "hono";
import type { AuthVariables } from "../middleware/requireAuth";

export type ItparkRole = "viewer" | "accountant" | "admin";

/**
 * Checks that the authenticated user can perform the given role's actions.
 * Currently: any authenticated user passes (ITPark has no separate role table).
 * Extend this when ITPark roles are added to users/tenants.
 */
export async function requireItparkRole(
  _role: ItparkRole,
  c: Context<{ Variables: AuthVariables }>
): Promise<Response | null> {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: "unauthenticated" }, 401) as unknown as Response;
  }
  // All authenticated users are allowed — no granular role table yet.
  return null;
}
