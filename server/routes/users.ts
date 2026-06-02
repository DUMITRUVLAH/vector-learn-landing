/**
 * BRANCH-703 — Users management endpoints
 * PATCH /api/users/:id/branch-scope — admin-only, sets branch_scope on a user
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
 * CRM-134: Users routes
 * GET /api/users/tenant-members — returns all users in the current tenant (for @mention autocomplete)
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const setBranchScopeSchema = z.object({
  /** UUID of branch to scope the user to. Null = remove scope (all branches). */
  branchId: z.string().uuid().nullable(),
});

export const userRoutes = new Hono<{ Variables: AuthVariables }>();

userRoutes.use("*", requireAuth);

/**
 * PATCH /api/users/:id/branch-scope
 * Admin-only endpoint to set or clear a user's branch_scope.
 * Only admin/owner (users with NULL branch_scope themselves) can call this.
 */
userRoutes.patch(
  "/:id/branch-scope",
  zValidator("json", setBranchScopeSchema),
  async (c) => {
    const requestingUser = c.get("user");
    const tenantId = requestingUser.tenantId;

    // Only admin-role users OR users without branch_scope themselves can set scopes
    const isAdmin =
      requestingUser.role === "admin" || requestingUser.branchScope === null;
    if (!isAdmin) {
      return c.json({ error: "forbidden" }, 403);
    }

    const targetId = c.req.param("id");
    const { branchId } = c.req.valid("json");

    // Ensure the target user belongs to the same tenant
    const target = await db.query.users.findFirst({
      where: and(eq(users.id, targetId), eq(users.tenantId, tenantId)),
    });
    if (!target) {
      return c.json({ error: "not_found" }, 404);
    }

    const [updated] = await db
      .update(users)
      .set({ branchScope: branchId, updatedAt: new Date() })
      .where(and(eq(users.id, targetId), eq(users.tenantId, tenantId)))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        branchScope: users.branchScope,
        updatedAt: users.updatedAt,
      });

    return c.json(updated);
  }
);
userRoutes.use("/*", requireAuth);
/** Returns id + name for all users in the current tenant (no passwords exposed). */
userRoutes.get("/tenant-members", async (c) => {
  const { tenantId } = c.get("user");
  const members = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(users.name);
  return c.json({ members });
