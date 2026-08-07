/**
 * PAR-002: requirePARRole middleware
 * Layered on top of requireAuth. Reads PAR roles from par_members.
 * A user can hold multiple PAR roles (requestor + approver, etc.).
 */
import type { MiddlewareHandler } from "hono";
import { db } from "../db/client";
import { parMembers } from "../db/schema/par";
import { users } from "../db/schema";
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
/**
 * Tenant-level roles treated as an implicit PAR admin.
 *
 * This solves one specific bootstrap problem: a brand-new tenant has zero
 * par_members rows, so without it nobody could ever assign the FIRST PAR member
 * (assigning requires par_admin). One role is enough for that, and it is "admin".
 *
 * "manager" used to be in here too, which meant anyone made a manager for
 * unrelated reasons could silently approve payment requests, read the audit log
 * and grant themselves PAR roles — without appearing in the members list. In a
 * segregation-of-duties system that is the wrong default. Existing managers were
 * given an EXPLICIT par_admin row by migration 0137, so nobody lost access; from
 * here on the authority is visible in the members screen and revocable there.
 */
export const IMPLICIT_PAR_ADMIN_TENANT_ROLES: readonly string[] = ["admin"];

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

    // Tenant admins/managers implicitly satisfy any PAR role requirement.
    if (IMPLICIT_PAR_ADMIN_TENANT_ROLES.includes(user.role)) {
      await next();
      return;
    }

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
  tenantId: string,
  tenantRole?: string
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
  const roles = members.map((m) => m.role);

  // Tenant admins/managers implicitly hold par_admin so the UI exposes the full
  // PAR toolset (admin page, reports, payee visibility) and they can bootstrap
  // real PAR members. Mirrors the requirePARRole middleware above. When the
  // caller doesn't already know the tenant role, look it up so EVERY call site
  // gets consistent behavior without having to thread it through.
  let role = tenantRole;
  if (role === undefined) {
    const [u] = await db
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
    role = u?.role;
  }
  if (role && IMPLICIT_PAR_ADMIN_TENANT_ROLES.includes(role) && !roles.includes("par_admin")) {
    roles.push("par_admin");
  }

  return roles;
}
