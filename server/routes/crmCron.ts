/**
 * CRM Faza 9 — cronul zilnic: aprinde cadențele scadente și rulează reactivarea.
 *
 *   GET /api/crm/cron/daily  → intrarea Vercel Cron (protejată cu CRON_SECRET)
 *
 * Fără el, cadențele n-ar face nimic: o secvență cu trei pași ar rămâne la pasul 0 pentru
 * totdeauna, iar clienții pierduți de un an n-ar fi treziți niciodată.
 *
 * Același tipar ca `parCron.ts` / `finCron.ts`: Vercel nu se poate auto-programa, deci un cron
 * lovește ruta, iar antetul `Authorization: Bearer <CRON_SECRET>` o ține departe de public.
 *
 * Mounted in app.ts: app.route("/api/crm/cron", crmCronRoutes)
 */
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { crmReengagementRules } from "../db/schema/crmCadences";
import { processDueEnrollments } from "../lib/crm/cadences";
import { runReengagement } from "../lib/crm/reengagement";

export const crmCronRoutes = new Hono();

crmCronRoutes.get("/daily", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return c.json({ error: "cron_not_configured", detail: "CRON_SECRET env var is not set." }, 503);
  }
  if ((c.req.header("authorization") ?? "") !== `Bearer ${secret}`) {
    return c.json({ error: "unauthorized" }, 401);
  }

  // Pasul 1: cadențele, pe toate workspace-urile deodată (interogarea filtrează pe scadență, nu
  // pe tenant — un singur query în loc de N).
  const cadences = await processDueEnrollments(new Date());

  // Pasul 2: reactivarea, per workspace. Aici nu se poate altfel: regulile, etapele „pierdut" și
  // istoricul sunt ale fiecărui client în parte. Rulăm doar pentru tenanții care CHIAR au reguli
  // active — restul n-au ce procesa.
  const tenantsWithRules = await db
    .selectDistinct({ tenantId: crmReengagementRules.tenantId })
    .from(crmReengagementRules)
    .where(eq(crmReengagementRules.enabled, true));

  let due = 0;
  let applied = 0;
  let failed = 0;
  for (const row of tenantsWithRules) {
    try {
      const result = await runReengagement(row.tenantId);
      due += result.due;
      applied += result.applied;
      failed += result.failed;
    } catch (e) {
      // Un workspace cu date stricate nu are voie să oprească cronul pentru ceilalți.
      console.error("[crm/cron] reactivarea a eșuat pentru tenantul", row.tenantId, e instanceof Error ? e.message : e);
      failed++;
    }
  }

  return c.json({ ok: true, cadences, reengagement: { tenants: tenantsWithRules.length, due, applied, failed } });
});
