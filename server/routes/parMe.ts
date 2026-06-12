/**
 * PAR-002: GET /api/par/me — current user's PAR roles
 */
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";

export const parMeRoutes = new Hono<{ Variables: AuthVariables }>();
parMeRoutes.use("*", requireAuth);

parMeRoutes.get("/", async (c) => {
  const user = c.get("user");
  const roles = await getUserPARRoles(user.id, user.tenantId);
  return c.json({ roles, userId: user.id, tenantId: user.tenantId });
});
