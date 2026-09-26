/**
 * CRM Faza 9 — cronul zilnic: aprinde cadențele scadente și rulează reactivarea.
 *
 *   GET  /api/crm/cron/daily   → intrarea Vercel Cron (protejată cu CRON_SECRET)
 *   POST /api/crm/cron/digest-now → digestul meu de taskuri restante, acum (buton de test)
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
import { runRecall } from "../lib/crm/recall";
import { crmRecallSettings } from "../db/schema/crmRecall";
import { runCrmTaskDigest, runCrmTaskDigestForTenant } from "../services/crm/taskDigest";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { crmAutomations } from "../db/schema/crmAutomations";
import { runIdleAutomations } from "./crmAutomations";
import { assignLeadAutomatically } from "./crmAssignment";

export const crmCronRoutes = new Hono<{ Variables: AuthVariables }>();

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

  // Pasul 3: contactele repartizate și neatinse se întorc în rezervă (CC-7). Rulează doar pentru
  // workspace-urile care au PORNIT regula — o automatizare care ia clienți de la un agent nu se
  // aprinde singură.
  let recall = { tenants: 0, due: 0, recalled: 0 };
  try {
    const tenantsWithRecall = await db
      .select({ tenantId: crmRecallSettings.tenantId })
      .from(crmRecallSettings)
      .where(eq(crmRecallSettings.enabled, true));
    recall.tenants = tenantsWithRecall.length;
    for (const row of tenantsWithRecall) {
      try {
        const res = await runRecall(row.tenantId);
        recall.due += res.due;
        recall.recalled += res.recalled;
      } catch (e) {
        console.error("[crm/cron] întoarcerea în rezervă a eșuat pentru tenantul", row.tenantId, e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    // Tabela poate lipsi pe o bază rămasă în urmă: restul cronului trebuie să meargă mai departe.
    console.error("[crm/cron] setările de întoarcere nu s-au putut citi:", e instanceof Error ? e.message : e);
  }

  // Pasul 4: digestul de taskuri restante (cerința 18). Decide singur dacă e ora potrivită
  // local — cronul lovește în UTC, iar ora de iarnă n-are voie să mute digestul în tăcere.
  let digest;
  try {
    digest = await runCrmTaskDigest();
  } catch (e) {
    console.error("[crm/cron] digestul de taskuri a eșuat:", e instanceof Error ? e.message : e);
    digest = { tenants: 0, recipients: 0, emails: 0, skipped: 0 };
  }

  // Pasul 5 (CRM-A02): automatizările „lead neatins N zile". Doar workspace-urile cu reguli pornite;
  // filtrul pe tipul declanșatorului e în `runIdleAutomations` (e jsonb, nu o coloană).
  const idle = { tenants: 0, rules: 0, fired: 0 };
  try {
    const tenantsWithAutomations = await db
      .selectDistinct({ tenantId: crmAutomations.tenantId })
      .from(crmAutomations)
      .where(eq(crmAutomations.enabled, true));
    for (const row of tenantsWithAutomations) {
      try {
        const res = await runIdleAutomations(row.tenantId, new Date(), async (lead) => {
          const decision = await assignLeadAutomatically(row.tenantId, lead);
          return decision?.userId ?? null;
        });
        if (res.rules > 0) idle.tenants++;
        idle.rules += res.rules;
        idle.fired += res.fired;
      } catch (e) {
        console.error("[crm/cron] lead-urile uitate au eșuat pentru tenantul", row.tenantId, e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error("[crm/cron] automatizările nu s-au putut citi:", e instanceof Error ? e.message : e);
  }

  return c.json({
    ok: true,
    idle,
    cadences,
    reengagement: { tenants: tenantsWithRules.length, due, applied, failed },
    recall,
    digest,
  });
});

/**
 * Butonul „trimite-mi acum digestul", pentru cine vrea să vadă cum arată. Sare peste fereastra
 * orară, dar NU peste anti-dublură: un test nu are voie să dubleze emailul real al unui coleg.
 */
crmCronRoutes.post("/digest-now", requireAuth, async (c) => {
  const user = c.get("user");
  const summary = await runCrmTaskDigestForTenant(user.tenantId, { force: true, onlyUserId: user.id });
  return c.json({ ok: true, ...summary });
});
