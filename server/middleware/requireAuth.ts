import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE, getSessionUser } from "../auth/session";
import type { User } from "../db/schema";

export type AuthVariables = {
  user: User;
  sessionToken: string;
};

export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    return c.json({ error: "unauthenticated" }, 401);
  }
  const result = await getSessionUser(token);
  if (!result) {
    return c.json({ error: "invalid_session" }, 401);
  }
  // SET-801: Disabled users (is_active = false) are blocked from all authenticated endpoints.
  if (result.user.isActive === false) {
    return c.json({ error: "account_disabled" }, 401);
  }
  c.set("user", result.user);
  c.set("sessionToken", token);
  await next();
};

export function getAuthUser(c: Context<{ Variables: AuthVariables }>): User {
  const user = c.get("user");
  if (!user) throw new Error("requireAuth not applied");
  return user;
}
