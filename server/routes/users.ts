/**
 * CRM-134: Users routes
 * GET /api/users/tenant-members — returns all users in the current tenant (for @mention autocomplete)
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const userRoutes = new Hono<{ Variables: AuthVariables }>();

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
});
