import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const teamRoutes = new Hono<{ Variables: AuthVariables }>();

teamRoutes.use("*", requireAuth);

/**
 * GET /api/team/members
 * Returns all active users for the current tenant (for AssigneePicker).
 * "Active" = all users (no soft-delete column yet; filtering by tenantId is enough).
 */
teamRoutes.get("/members", async (c) => {
  const user = c.get("user");
  const members = await db
    .select({
      id: users.id,
      fullName: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.tenantId, user.tenantId))
    .orderBy(users.name);

  return c.json(members);
});
