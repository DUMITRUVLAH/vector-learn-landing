/**
 * COMMS-301 — cine are voie în modulul de comunicare.
 *
 * Aceeași regulă ca restul CRM-ului (`requireCrmAccess`, montat pe /api/crm/*): studenții,
 * părinții și oamenii scoși din CRM nu văd conversațiile clienților și nu scriu în numele firmei.
 * Rutele modulului stau sub /api/comms/*, deci poarta CRM nu le acoperă singură — se aplică aici,
 * în fiecare router autentificat, după `requireAuth`.
 */
import type { MiddlewareHandler } from "hono";
import type { AuthVariables } from "../../middleware/requireAuth";
import { userHasCrmAccess } from "../../middleware/requireCrmAccess";

export const requireCommsAccess: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const user = c.get("user");
  if (!user) return c.json({ error: "unauthenticated" }, 401);
  if (!(await userHasCrmAccess(user))) return c.json({ error: "crm_access_revoked" }, 403);
  await next();
};
