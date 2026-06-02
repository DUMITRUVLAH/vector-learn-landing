/**
 * HEALTH-001 — requireAdmin middleware
 *
 * Allows access only to users whose email:
 * 1. Matches the ADMIN_EMAIL env variable, OR
 * 2. Ends with @vectorlearn.ro
 *
 * Returns 403 for all other authenticated users.
 * Must be used AFTER requireAuth (which sets the user context).
 */
import { MiddlewareHandler } from "hono";
import type { AuthVariables } from "./requireAuth";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@vectorlearn.ro";

export const requireAdmin: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const user = c.get("user");

  if (!user) {
    return c.json({ error: "Unauthenticated" }, 401);
  }

  const email = user.email.toLowerCase();
  const isAdmin =
    email === ADMIN_EMAIL.toLowerCase() ||
    email.endsWith("@vectorlearn.ro");

  if (!isAdmin) {
    return c.json({ error: "Forbidden — admin access required" }, 403);
  }

  await next();
};
