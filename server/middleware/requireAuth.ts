import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE, getSessionUser } from "../auth/session";
import type { User } from "../db/schema";

export type AuthVariables = {
  user: User;
  sessionToken: string;
  /**
   * SECURITY (audit 2026-08-29): id-ul superadminului de platformă când sesiunea curentă e o
   * sesiune ÎMPRUMUTATĂ (impersonare). NULL pentru o sesiune normală.
   *
   * Înainte, niciun handler nu știa că sesiunea e împrumutată: `par_audit` scria `actorUserId` =
   * utilizatorul CLIENTULUI, iar `signature_name` = numele lui, deci pe fișa de aprobări apărea
   * semnătura clientului pentru o decizie luată de altcineva. Non-repudierea era ruptă: clientul
   * nu putea demonstra că nu el a aprobat plata. Vezi middleware/impersonationGuard.ts.
   */
  impersonatedBy: string | null;
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
  c.set("impersonatedBy", result.session.impersonatedByUserId ?? null);
  await next();
};

export function getAuthUser(c: Context<{ Variables: AuthVariables }>): User {
  const user = c.get("user");
  if (!user) throw new Error("requireAuth not applied");
  return user;
}
