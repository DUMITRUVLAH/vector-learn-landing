/**
 * ITPARK-702: MITP compliance dashboard.
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §7
 * Mounted in server/app.ts: app.route("/api/itpark/dashboard", itparkDashboardRoutes)
 *
 * Route:
 *   GET /api/itpark/dashboard?year=YYYY  → { items, summary, year }
 *
 * For each engagement in the reporting year, returns the YTD eligible-revenue share
 * (latest cumulative monthlySharePct), its threshold status vs the tenant's configured
 * eligibility threshold (default 70%), and days until the MITP filing deadline
 * (30 April of the year following the reporting year).
 *
 * Frontend client: src/lib/api/itparkDashboard.ts (must match the DashboardResponse shape).
 */
import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/client";
import { itparkEngagements, itparkMonthly, itparkSettings } from "../db/schema/itpark";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const itparkDashboardRoutes = new Hono<{ Variables: AuthVariables }>();
itparkDashboardRoutes.use("*", requireAuth);

type ThresholdStatus = "conform" | "warning" | "risc";

/** Days from today until 30 April of (reportingYear + 1), the MITP filing deadline. */
function daysUntilDeadline(reportingYear: number): number {
  const deadline = new Date(Date.UTC(reportingYear + 1, 3, 30)); // month 3 = April
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((deadline.getTime() - todayUtc) / 86_400_000);
}

itparkDashboardRoutes.get("/", async (c) => {
  const user = c.get("user");
  const yearParam = c.req.query("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

  // Tenant eligibility threshold (default 70%).
  const settings = await db.query.itparkSettings.findFirst({
    where: eq(itparkSettings.tenantId, user.tenantId),
  });
  const thresholdPct = settings ? Number(settings.eligibilityThresholdPct) : 70;
  const warningBand = 10; // within 10 points below the threshold → "warning"

  const engagements = await db
    .select()
    .from(itparkEngagements)
    .where(
      and(
        eq(itparkEngagements.tenantId, user.tenantId),
        eq(itparkEngagements.reportingYear, year),
      ),
    )
    .orderBy(itparkEngagements.residentName);

  const items = await Promise.all(
    engagements.map(async (e) => {
      // Latest (highest month) cumulative share for the engagement.
      const latest = await db
        .select({ pct: itparkMonthly.monthlySharePct })
        .from(itparkMonthly)
        .where(
          and(
            eq(itparkMonthly.tenantId, user.tenantId),
            eq(itparkMonthly.engagementId, e.id),
          ),
        )
        .orderBy(desc(itparkMonthly.month))
        .limit(1);

      const eligiblePct = latest.length > 0 ? Number(latest[0].pct) : 0;

      let thresholdStatus: ThresholdStatus;
      if (eligiblePct >= thresholdPct) thresholdStatus = "conform";
      else if (eligiblePct >= thresholdPct - warningBand) thresholdStatus = "warning";
      else thresholdStatus = "risc";

      return {
        engagementId: e.id,
        residentName: e.residentName,
        idno: e.idno,
        eligiblePct,
        thresholdStatus,
        status: e.status,
        daysUntilDeadline: daysUntilDeadline(e.reportingYear),
        reportingYear: e.reportingYear,
      };
    }),
  );

  const summary = {
    total: items.length,
    belowThreshold: items.filter((i) => i.eligiblePct < thresholdPct).length,
    ready: items.filter((i) => i.status === "ready").length,
    exported: items.filter((i) => i.status === "exported").length,
  };

  return c.json({ items, summary, year });
});
