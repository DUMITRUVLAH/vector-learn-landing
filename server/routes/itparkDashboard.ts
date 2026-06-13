/**
 * ITPARK-702: MITP Compliance Dashboard
 * Mounted in server/app.ts: app.route("/api/itpark/dashboard", itparkDashboardRoutes)
 *
 * Routes:
 *   GET /api/itpark/dashboard?year=YYYY — agregat per engagement (eligiblePct, threshold, status, deadline)
 *
 * Logica de calcul:
 *   - Se preia lista engagement-urilor pentru anul dat (default: an curent)
 *   - Pentru fiecare engagement se preia suma liniilor de venit (itpark_revenue_lines)
 *   - eligiblePct = totalEligibleCents / totalSalesCents × 100 (sau totalSalesOverride dacă e setat)
 *   - thresholdStatus: conform (≥70%), warning (60–69%), risc (<60%)
 *   - daysUntilDeadline: 30 aprilie al anului respectiv – azi
 */
import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { itparkEngagements, itparkRevenueLines } from "../db/schema/itpark";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const itparkDashboardRoutes = new Hono<{ Variables: AuthVariables }>();
itparkDashboardRoutes.use("*", requireAuth);

// ─── Types ────────────────────────────────────────────────────────────────────

type ThresholdStatus = "conform" | "warning" | "risc";
type EngagementStatus = "draft" | "in_progress" | "ready" | "exported";

interface DashboardItem {
  engagementId: string;
  residentName: string;
  idno: string;
  eligiblePct: number;
  thresholdStatus: ThresholdStatus;
  status: EngagementStatus;
  daysUntilDeadline: number;
  reportingYear: number;
}

interface DashboardSummary {
  total: number;
  belowThreshold: number;
  ready: number;
  exported: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeThresholdStatus(pct: number): ThresholdStatus {
  if (pct >= 70) return "conform";
  if (pct >= 60) return "warning";
  return "risc";
}

function computeDaysUntilDeadline(year: number): number {
  const deadline = new Date(`${year}-04-30T23:59:59`);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function computeEligiblePct(
  totalEligibleCents: number,
  totalAllCents: number,
  totalSalesOverride: number | null
): number {
  const totalSales =
    totalSalesOverride && totalSalesOverride > 0
      ? Math.max(totalSalesOverride, totalAllCents)
      : totalAllCents;

  if (totalSales === 0) return 0;
  const raw = (totalEligibleCents / totalSales) * 100;
  return Math.round(raw * 100) / 100; // 2 decimale
}

// ─── GET / ─────────────────────────────────────────────────────────────────────

itparkDashboardRoutes.get("/", async (c) => {
  const user = c.get("user");

  // Year param (default: current year)
  const yearParam = c.req.query("year");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (isNaN(year) || year < 2000 || year > 2100) {
    return c.json({ error: "year invalid (2000–2100)" }, 400);
  }

  // Fetch engagements for the year
  const engs = await db
    .select()
    .from(itparkEngagements)
    .where(
      and(
        eq(itparkEngagements.tenantId, user.tenantId),
        eq(itparkEngagements.reportingYear, year)
      )
    );

  if (engs.length === 0) {
    return c.json({
      items: [],
      summary: { total: 0, belowThreshold: 0, ready: 0, exported: 0 },
      year,
    });
  }

  // Fetch aggregate revenue lines for all engagements at once
  const engIds = engs.map((e) => e.id);

  // SUM(amountCents) grouped by engagementId + isEligible
  const lineAgg = await db
    .select({
      engagementId: itparkRevenueLines.engagementId,
      isEligible: itparkRevenueLines.isEligible,
      totalCents: sql<string>`SUM(${itparkRevenueLines.amountCents})`,
    })
    .from(itparkRevenueLines)
    .where(
      and(
        inArray(itparkRevenueLines.engagementId, engIds),
        eq(itparkRevenueLines.tenantId, user.tenantId)
      )
    )
    .groupBy(itparkRevenueLines.engagementId, itparkRevenueLines.isEligible);

  // Build a map: engagementId → { eligibleCents, allCents }
  const lineMap = new Map<string, { eligibleCents: number; allCents: number }>();
  for (const row of lineAgg) {
    const cents = parseInt(row.totalCents ?? "0", 10) || 0;
    const entry = lineMap.get(row.engagementId) ?? { eligibleCents: 0, allCents: 0 };
    entry.allCents += cents;
    if (row.isEligible) entry.eligibleCents += cents;
    lineMap.set(row.engagementId, entry);
  }

  // Build dashboard items
  const items: DashboardItem[] = engs.map((eng) => {
    const agg = lineMap.get(eng.id) ?? { eligibleCents: 0, allCents: 0 };
    const eligiblePct = computeEligiblePct(
      agg.eligibleCents,
      agg.allCents,
      eng.totalSalesCents ?? null
    );
    const thresholdStatus = computeThresholdStatus(eligiblePct);
    const daysUntilDeadline = computeDaysUntilDeadline(year);

    return {
      engagementId: eng.id,
      residentName: eng.residentName,
      idno: eng.idno,
      eligiblePct,
      thresholdStatus,
      status: eng.status as EngagementStatus,
      daysUntilDeadline,
      reportingYear: eng.reportingYear,
    };
  });

  // Summary
  const summary: DashboardSummary = {
    total: items.length,
    belowThreshold: items.filter((i) => i.eligiblePct < 70).length,
    ready: items.filter((i) => i.status === "ready").length,
    exported: items.filter((i) => i.status === "exported").length,
  };

  return c.json({ items, summary, year });
});
