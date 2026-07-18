import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { platformAdmins } from "../db/schema/par";
import type { AuthVariables } from "./requireAuth";

export const requirePlatformAdmin: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  const [admin] = await db.select({ id: platformAdmins.id }).from(platformAdmins).where(eq(platformAdmins.userId, user.id));
  if (!admin) return c.json({ error: "platform_admin_required" }, 403);
  await next();
};
