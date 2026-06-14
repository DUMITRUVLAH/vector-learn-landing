/**
 * CORE-002: requireFinRole middleware — FinDesk role-based access control
 * Hierarchy: owner > accountant > cfo (read+reports) > viewer (read-only)
 * CORE: backlog/fin/FIN-CORE.md §2, rule #7
 */
import type { MiddlewareHandler } from "hono";
import { db } from "../db/client";
import { finMembers } from "../db/schema/finCore";
import { and, eq } from "drizzle-orm";
import type { AuthVariables } from "./requireAuth";

export type FinRole = "owner" | "accountant" | "cfo" | "viewer";

/**
 * Role hierarchy — higher index = higher privilege.
 * `cfo` and `viewer` are read-only; `accountant` and `owner` can create/edit.
 */
const FIN_ROLE_LEVEL: Record<FinRole, number> = {
  viewer: 0,
  cfo: 1,
  accountant: 2,
  owner: 3,
};

/**
 * Middleware factory. Checks that the authenticated user has AT LEAST the
 * minimum required role level within their tenant's FinDesk workspace.
 *
 * Usage:
 *   route.use("*", requireFinRole("accountant"))  // accountant or owner
 *   route.use("*", requireFinRole("owner"))        // owner only
 *   route.use("*", requireFinRole("viewer"))       // any member
 */
export function requireFinRole(
  minRole: FinRole
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const member = await db
      .select({ role: finMembers.role })
      .from(finMembers)
      .where(
        and(
          eq(finMembers.tenantId, user.tenantId),
          eq(finMembers.userId, user.id)
        )
      )
      .limit(1);

    if (member.length === 0) {
      return c.json({ error: "forbidden", detail: "not_a_fin_member" }, 403);
    }

    const userLevel = FIN_ROLE_LEVEL[member[0].role as FinRole] ?? -1;
    const requiredLevel = FIN_ROLE_LEVEL[minRole];

    if (userLevel < requiredLevel) {
      return c.json(
        { error: "forbidden", required_role: minRole, your_role: member[0].role },
        403
      );
    }

    await next();
  };
}

/**
 * Utility: get the current user's FinDesk role (or null if not a member).
 * Call after requireFinRole or requireAuth to get the role for business logic.
 */
export async function getFinRole(
  tenantId: string,
  userId: string
): Promise<FinRole | null> {
  const rows = await db
    .select({ role: finMembers.role })
    .from(finMembers)
    .where(and(eq(finMembers.tenantId, tenantId), eq(finMembers.userId, userId)))
    .limit(1);

  if (rows.length === 0) return null;
  return rows[0].role as FinRole;
}
