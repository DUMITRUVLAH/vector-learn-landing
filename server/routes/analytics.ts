/**
 * CRM-112 — Analytics endpoints
 * GET /api/analytics/crm/funnel — conversion funnel
 * GET /api/analytics/crm/lost-reasons — lost reason aggregation
 * GET /api/analytics/crm/roas — ROAS per campaign
 * POST /api/analytics/crm/budgets — set ad spend per campaign+month
 *
 * BRANCH-704 — Branch KPI analytics
 * GET /api/analytics/branches — per-branch KPIs (MRR, active students, lessons this month)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, count, eq, gte, isNotNull, lt, sql, sum } from "drizzle-orm";
import { db } from "../db/client";
import { leads, adCampaignBudgets, branches, students, payments, lessons } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const analyticsRoutes = new Hono<{ Variables: AuthVariables }>();

analyticsRoutes.use("/*", requireAuth);

// ─── Funnel ────────────────────────────────────────────────────────────────────

// GET /api/analytics/crm/funnel
analyticsRoutes.get("/crm/funnel", async (c) => {
  const tenantId = c.get("user").tenantId;

  // Count leads per stage
  const stageCountsResult = await db
    .select({
      stage: leads.stage,
      cnt: count(leads.id),
    })
    .from(leads)
    .where(eq(leads.tenantId, tenantId))
    .groupBy(leads.stage);

  const stageCounts = Array.isArray(stageCountsResult) ? stageCountsResult : (stageCountsResult as unknown as typeof stageCountsResult);

  const stageMap: Record<string, number> = {};
  for (const row of stageCounts) {
    stageMap[row.stage] = Number(row.cnt);
  }

  const funnelStages = ["new", "contacted", "trial", "paid"];
  const funnel = funnelStages.map((stage) => ({
    stage,
    count: stageMap[stage] ?? 0,
  }));

  const total = Object.values(stageMap).reduce((a, b) => a + b, 0);
  const paid = stageMap["paid"] ?? 0;
  const conversionRate = total > 0 ? Math.round((paid / total) * 100) : 0;

  // Breakdown per source for paid leads
  const sourceBreakdownResult = await db
    .select({
      source: leads.source,
      cnt: count(leads.id),
    })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.stage, "paid")))
    .groupBy(leads.source);

  const sourceBreakdown = (Array.isArray(sourceBreakdownResult) ? sourceBreakdownResult : []).map((r) => ({
    source: r.source,
    count: Number(r.cnt),
  }));

  return c.json({
    funnel,
    total,
    paid,
    conversionRate,
    sourceBreakdown,
  });
});

// ─── Lost reasons ──────────────────────────────────────────────────────────────

// GET /api/analytics/crm/lost-reasons
analyticsRoutes.get("/crm/lost-reasons", async (c) => {
  const tenantId = c.get("user").tenantId;

  const reasonsResult = await db
    .select({
      reason: leads.lostReason,
      cnt: count(leads.id),
    })
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, tenantId),
        eq(leads.stage, "lost"),
        isNotNull(leads.lostReason)
      )
    )
    .groupBy(leads.lostReason)
    .orderBy(sql`count(${leads.id}) desc`);

  const reasons = (Array.isArray(reasonsResult) ? reasonsResult : []).map((r) => ({
    reason: r.reason ?? "Necunoscut",
    count: Number(r.cnt),
  }));

  const total = reasons.reduce((a, r) => a + r.count, 0);
  const withPercent = reasons.map((r) => ({
    ...r,
    percent: total > 0 ? Math.round((r.count / total) * 100) : 0,
  }));

  return c.json({ reasons: withPercent, total });
});

// ─── ROAS per campaign ────────────────────────────────────────────────────────

// GET /api/analytics/crm/roas
analyticsRoutes.get("/crm/roas", async (c) => {
  const tenantId = c.get("user").tenantId;

  // Count paid leads per utm_campaign
  const paidByCampaignResult = await db
    .select({
      campaign: leads.utmCampaign,
      paidCount: count(leads.id),
    })
    .from(leads)
    .where(
      and(
        eq(leads.tenantId, tenantId),
        eq(leads.stage, "paid"),
        isNotNull(leads.utmCampaign)
      )
    )
    .groupBy(leads.utmCampaign);

  const paidByCampaign: Record<string, number> = {};
  for (const row of (Array.isArray(paidByCampaignResult) ? paidByCampaignResult : [])) {
    if (row.campaign) paidByCampaign[row.campaign] = Number(row.paidCount);
  }

  // Also get total leads per campaign (for funnel per campaign)
  const totalByCampaignResult = await db
    .select({
      campaign: leads.utmCampaign,
      totalCount: count(leads.id),
    })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), isNotNull(leads.utmCampaign)))
    .groupBy(leads.utmCampaign);

  const totalByCampaign: Record<string, number> = {};
  for (const row of (Array.isArray(totalByCampaignResult) ? totalByCampaignResult : [])) {
    if (row.campaign) totalByCampaign[row.campaign] = Number(row.totalCount);
  }

  // Fetch ad budgets
  const budgets = await db
    .select()
    .from(adCampaignBudgets)
    .where(eq(adCampaignBudgets.tenantId, tenantId));

  // Aggregate budgets per campaign (sum all months)
  const spendByCampaign: Record<string, number> = {};
  for (const budget of (Array.isArray(budgets) ? budgets : [])) {
    spendByCampaign[budget.utmCampaign] = (spendByCampaign[budget.utmCampaign] ?? 0) + budget.spendCents;
  }

  // Build ROAS report
  const allCampaigns = new Set([
    ...Object.keys(paidByCampaign),
    ...Object.keys(totalByCampaign),
    ...Object.keys(spendByCampaign),
  ]);

  const rows = Array.from(allCampaigns).map((campaign) => {
    const paid = paidByCampaign[campaign] ?? 0;
    const total = totalByCampaign[campaign] ?? 0;
    const spendCents = spendByCampaign[campaign] ?? 0;
    const costPerStudentCents = paid > 0 ? Math.round(spendCents / paid) : null;
    const convRate = total > 0 ? Math.round((paid / total) * 100) : 0;

    return {
      campaign,
      totalLeads: total,
      paidStudents: paid,
      conversionRate: convRate,
      spendCents,
      costPerStudentCents,
    };
  });

  // Sort by paidStudents desc
  rows.sort((a, b) => b.paidStudents - a.paidStudents);

  return c.json({ campaigns: rows });
});

// ─── CRM-113: Pipeline value ──────────────────────────────────────────────────

analyticsRoutes.get("/crm/pipeline-value", async (c) => {
  const tenantId = c.get("user").tenantId;
  const result = await db
    .select({
      stage: leads.stage,
      totalValueCents: sum(leads.valueCents),
      totalDebtCents: sum(leads.debtCents),
      cnt: count(leads.id),
    })
    .from(leads)
    .where(eq(leads.tenantId, tenantId))
    .groupBy(leads.stage);

  const rows = (Array.isArray(result) ? result : []).map((r) => ({
    stage: r.stage,
    count: Number(r.cnt),
    valueCents: Number(r.totalValueCents ?? 0),
    debtCents: Number(r.totalDebtCents ?? 0),
  }));

  return c.json({ stages: rows, grandTotalValueCents: rows.reduce((s, r) => s + r.valueCents, 0) });
});

// ─── Budget management ────────────────────────────────────────────────────────

const setBudgetSchema = z.object({
  utmCampaign: z.string().min(1).max(100),
  spendCents: z.number().int().min(0),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format: YYYY-MM"),
});

// POST /api/analytics/crm/budgets — upsert ad spend for campaign+month
analyticsRoutes.post("/crm/budgets", zValidator("json", setBudgetSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { utmCampaign, spendCents, month } = c.req.valid("json");

  // Check if exists
  const existing = await db.query.adCampaignBudgets.findFirst({
    where: and(
      eq(adCampaignBudgets.tenantId, tenantId),
      eq(adCampaignBudgets.utmCampaign, utmCampaign),
      eq(adCampaignBudgets.month, month)
    ),
  });

  if (existing) {
    const [updated] = await db
      .update(adCampaignBudgets)
      .set({ spendCents, updatedAt: new Date() })
      .where(eq(adCampaignBudgets.id, existing.id))
      .returning();
    return c.json(updated);
  }

  const [created] = await db
    .insert(adCampaignBudgets)
    .values({ tenantId, utmCampaign, spendCents, month })
    .returning();

  return c.json(created, 201);
});

// ─── BRANCH-704: Per-branch KPI analytics ────────────────────────────────────

/**
 * GET /api/analytics/branches
 * Returns KPIs per active branch for the tenant.
 * Optional query param `period` (default `month`): `month` | `quarter`
 * Response: { branches: [{ branchId, branchName, mrr, activeStudents, lessonsThisMonth }] }
 */
analyticsRoutes.get("/branches", async (c) => {
  const tenantId = c.get("user").tenantId;
  const periodParam = c.req.query("period") ?? "month";

  // Determine date range
  const now = new Date();
  let periodStart: Date;
  if (periodParam === "quarter") {
    // Last 3 months
    periodStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  } else {
    // Current month
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // 1. Get all active branches for tenant
  const branchRows = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(and(eq(branches.tenantId, tenantId), eq(branches.status, "active")));

  const branchList = Array.isArray(branchRows) ? branchRows : [];

  // 2. For each branch, compute KPIs
  const result = await Promise.all(
    branchList.map(async (branch) => {
      // Active students in this branch
      const [activeRow] = await db
        .select({ cnt: count(students.id) })
        .from(students)
        .where(
          and(
            eq(students.tenantId, tenantId),
            eq(students.branchId, branch.id),
            eq(students.status, "active")
          )
        );
      const activeStudents = Number(activeRow?.cnt ?? 0);

      // MRR approximation: sum of paid payments in period for students of this branch
      const mrrResult = await db
        .select({ total: sum(payments.amountCents) })
        .from(payments)
        .innerJoin(students, eq(payments.studentId, students.id))
        .where(
          and(
            eq(payments.tenantId, tenantId),
            eq(students.branchId, branch.id),
            eq(payments.status, "paid"),
            gte(payments.paidAt, periodStart),
            lt(payments.paidAt, periodEnd)
          )
        );
      const mrr = Number((Array.isArray(mrrResult) ? mrrResult[0] : mrrResult)?.total ?? 0);

      // Lessons this period for this branch
      const [lessonsRow] = await db
        .select({ cnt: count(lessons.id) })
        .from(lessons)
        .where(
          and(
            eq(lessons.tenantId, tenantId),
            eq(lessons.branchId, branch.id),
            gte(lessons.scheduledAt, periodStart),
            lt(lessons.scheduledAt, periodEnd)
          )
        );
      const lessonsThisMonth = Number(lessonsRow?.cnt ?? 0);

      return {
        branchId: branch.id,
        branchName: branch.name,
        mrr,
        activeStudents,
        lessonsThisMonth,
      };
    })
  );

  return c.json({ branches: result });
});
