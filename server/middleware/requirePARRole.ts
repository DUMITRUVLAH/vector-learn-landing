/**
 * PAR-002: requirePARRole middleware
 * Layered on top of requireAuth. Reads PAR roles from par_members.
 * A user can hold multiple PAR roles (requestor + approver, etc.).
 */
import type { MiddlewareHandler } from "hono";
import { db } from "../db/client";
import { parMembers } from "../db/schema/par";
import { and, eq, inArray } from "drizzle-orm";
import { type AuthVariables } from "./requireAuth";

export type ParRole = "requestor" | "approver" | "finance" | "par_admin";

/**
 * Checks that the authenticated user has at least one of the requested PAR roles
 * within their tenant. Expects requireAuth to have run first (or chains it).
 *
 * Usage:
 *   route.use("*", requirePARRole("approver", "par_admin"))
 *   route.use("*", requirePARRole("finance"))
 */
export function requirePARRole(
  ...roles: ParRole[]
): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c, next) => {
    // Ensure authentication first
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "unauthenticated" }, 401);
    }

    const tenantId = user.tenantId;
    const userId = user.id;

    // Look up the user's PAR roles in this tenant
    const members = await db
      .select({ role: parMembers.role })
      .from(parMembers)
      .where(
        and(
          eq(parMembers.tenantId, tenantId),
          eq(parMembers.userId, userId),
          inArray(parMembers.role, roles)
        )
      );

    if (members.length === 0) {
      return c.json({ error: "forbidden", required_roles: roles }, 403);
    }

    await next();
  };
}

/**
 * Gets all PAR roles for the authenticated user in their tenant.
 * Returns empty array if user has no PAR roles.
 */
export async function getUserPARRoles(
  userId: string,
  tenantId: string
): Promise<ParRole[]> {
  const members = await db
    .select({ role: parMembers.role, approvalLimitCents: parMembers.approvalLimitCents })
    .from(parMembers)
    .where(
      and(
        eq(parMembers.tenantId, tenantId),
        eq(parMembers.userId, userId)
      )
    );
  return members.map((m) => m.role);
}
