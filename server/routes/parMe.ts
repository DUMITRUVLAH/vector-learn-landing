/**
 * PAR-002: GET /api/par/me — current user's PAR roles
 */
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { isPreApprover } from "../lib/par/preApprovers";

export const parMeRoutes = new Hono<{ Variables: AuthVariables }>();
parMeRoutes.use("*", requireAuth);

parMeRoutes.get("/", async (c) => {
  const user = c.get("user");
  const roles = await getUserPARRoles(user.id, user.tenantId, user.role);
  // `preApprover` deschide inboxul de aprobare cui n-are rolul general: un pre-aprobator de proiect
  // semnează pe nume, deci meniul și ruta trebuie să-l lase înăuntru fără să-i dăm rolul
  // `approver`, care i-ar da drept de semnătură pe toate cererile organizației.
  const preApprover = await isPreApprover(user.tenantId, user.id);
  return c.json({ roles, preApprover, userId: user.id, tenantId: user.tenantId });
});
