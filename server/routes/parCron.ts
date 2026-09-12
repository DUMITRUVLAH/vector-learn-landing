/**
 * VM5-11: declanșatorul digestului de aprobări.
 *
 *   GET  /api/par/cron/approval-digest  → intrarea Vercel Cron (protejată cu CRON_SECRET)
 *   POST /api/par/cron/digest-now       → trimite digestul organizației mele, acum (test)
 *
 * Același tipar ca `finCron.ts`: Vercel nu se poate auto-programa, deci un cron lovește ruta, iar
 * antetul `Authorization: Bearer <CRON_SECRET>` o ține departe de public. Ora la care se trimite o
 * decide codul, nu cronul — vezi `digestRunner.inDigestWindow`.
 *
 * Mounted in app.ts: app.route("/api/par/cron", parCronRoutes)
 */
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getUserPARRoles } from "../middleware/requirePARRole";
import { runApprovalDigest, runApprovalDigestForTenant } from "../services/par/digestRunner";

export const parCronRoutes = new Hono<{ Variables: AuthVariables }>();

parCronRoutes.get("/approval-digest", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return c.json({ error: "cron_not_configured", detail: "CRON_SECRET env var is not set." }, 503);
  }
  if ((c.req.header("authorization") ?? "") !== `Bearer ${secret}`) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return c.json({ ok: true, ...(await runApprovalDigest()) });
});

/**
 * Butonul „trimite-mi acum digestul" — pe organizația proprie, pentru cine administrează PAR-ul.
 * Sare peste fereastra de oră, dar NU peste anti-dublură: un test nu are voie să dubleze emailul
 * real al unui coleg.
 */
parCronRoutes.post("/digest-now", requireAuth, async (c) => {
  const user = c.get("user");
  const roles = await getUserPARRoles(user.id, user.tenantId);
  if (!roles.includes("par_admin") && !roles.includes("finance")) {
    return c.json({ error: "forbidden: par_admin or finance role required" }, 403);
  }
  const summary = await runApprovalDigestForTenant(user.tenantId, { force: true });
  return c.json({ ok: true, ...summary });
});
