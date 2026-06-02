/**
 * CRM-112 — Analytics endpoints
 * GET /api/analytics/crm/funnel — conversion funnel
 * GET /api/analytics/crm/lost-reasons — lost reason aggregation
 * GET /api/analytics/crm/roas — ROAS per campaign
 * POST /api/analytics/crm/budgets — set ad spend per campaign+month
 *
 * INTEG-104 — 4 cross-module analytics endpoints:
 * GET /api/analytics/kpi — summary KPIs (revenue MTD, active students, conversion rate)
 * GET /api/analytics/revenue-over-time — revenue timeseries (daily/monthly)
 * GET /api/analytics/revenue-by-course — revenue grouped by course
 * GET /api/analytics/student-ltv — average student lifetime value
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, count, eq, gte, isNotNull, isNull, sql, sum } from "drizzle-orm";
import { db } from "../db/client";
import { leads, adCampaignBudgets, pipelineStages, payments, students, courses } from "../db/schema";
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

// ─── CRM-125: Weighted Forecast ───────────────────────────────────────────────

// GET /api/analytics/crm/forecast
analyticsRoutes.get("/crm/forecast", async (c) => {
  const tenantId = c.get("user").tenantId;

  // Get all pipeline stages for this tenant
  const stages = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.tenantId, tenantId))
    .orderBy(asc(pipelineStages.orderIndex));

  // Sum value_cents per stage key
  const valueByStageResult = await db
    .select({
      stage: leads.stage,
      gross: sum(leads.valueCents),
      cnt: count(leads.id),
    })
    .from(leads)
    .where(eq(leads.tenantId, tenantId))
    .groupBy(leads.stage);

  const valueByStage = Array.isArray(valueByStageResult) ? valueByStageResult : (valueByStageResult as unknown as typeof valueByStageResult);

  const valueMap: Record<string, { gross: number; cnt: number }> = {};
  for (const row of valueByStage) {
    valueMap[row.stage] = {
      gross: Number(row.gross ?? 0),
      cnt: Number(row.cnt ?? 0),
    };
  }

  // Build forecast per stage
  const forecastStages = stages.map((stage) => {
    const { gross = 0, cnt = 0 } = valueMap[stage.key] ?? {};
    const weightedCents = Math.round(gross * (stage.probabilityPct / 100));
    return {
      stageId: stage.id,
      stage: stage.key,
      label: stage.label,
      color: stage.color,
      probabilityPct: stage.probabilityPct,
      count: cnt,
      grossCents: gross,
      weightedCents,
    };
  });

  const totalGrossCents = forecastStages.reduce((s, f) => s + f.grossCents, 0);
  const totalWeightedCents = forecastStages.reduce((s, f) => s + f.weightedCents, 0);

  return c.json({ stages: forecastStages, totalGrossCents, totalWeightedCents });
});

// ─── INTEG-104: KPI summary ───────────────────────────────────────────────────

/**
 * GET /api/analytics/kpi
 * Summary KPIs for the current month:
 * - revenueMtdCents: sum of paid payments in current calendar month
 * - activeStudents: count of students with status='active'
 * - conversionRate: paid leads / total leads (percent)
 * - overdueCount: payments with status='overdue'
 */
analyticsRoutes.get("/kpi", async (c) => {
  const tenantId = c.get("user").tenantId;

  // Start of current month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Revenue month-to-date (paid payments in current month)
  const revResult = await db
    .select({ total: sum(payments.amountCents) })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, "paid"),
        gte(payments.paidAt, monthStart)
      )
    );

  const revRows = Array.isArray(revResult) ? revResult : (revResult as unknown as { rows: typeof revResult }).rows ?? revResult;
  const revenueMtdCents = Number(revRows[0]?.total ?? 0);

  // Active students
  const studResult = await db
    .select({ cnt: count(students.id) })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.status, "active")));

  const studRows = Array.isArray(studResult) ? studResult : (studResult as unknown as { rows: typeof studResult }).rows ?? studResult;
  const activeStudents = Number(studRows[0]?.cnt ?? 0);

  // Conversion rate (paid leads / total leads)
  const totalLeadsResult = await db
    .select({ cnt: count(leads.id) })
    .from(leads)
    .where(eq(leads.tenantId, tenantId));

  const paidLeadsResult = await db
    .select({ cnt: count(leads.id) })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), eq(leads.stage, "paid")));

  const totalLeads = Number((Array.isArray(totalLeadsResult) ? totalLeadsResult : [])[0]?.cnt ?? 0);
  const paidLeads = Number((Array.isArray(paidLeadsResult) ? paidLeadsResult : [])[0]?.cnt ?? 0);
  const conversionRate = totalLeads > 0 ? Math.round((paidLeads / totalLeads) * 100) : 0;

  // Overdue payments
  const overdueResult = await db
    .select({ cnt: count(payments.id) })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.status, "overdue")));

  const overdueRows = Array.isArray(overdueResult) ? overdueResult : (overdueResult as unknown as { rows: typeof overdueResult }).rows ?? overdueResult;
  const overdueCount = Number(overdueRows[0]?.cnt ?? 0);

  return c.json({ revenueMtdCents, activeStudents, conversionRate, overdueCount });
});

// ─── INTEG-104: Revenue over time ────────────────────────────────────────────

/**
 * GET /api/analytics/revenue-over-time?months=3&granularity=month
 * Revenue timeseries. Default: last 3 months, monthly granularity.
 * granularity: "day" | "month"
 */
analyticsRoutes.get("/revenue-over-time", async (c) => {
  const tenantId = c.get("user").tenantId;
  const monthsParam = c.req.query("months");
  const granularity = c.req.query("granularity") ?? "month";

  const months = Math.min(12, Math.max(1, Number(monthsParam ?? 3) || 3));
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const truncUnit = granularity === "day" ? "day" : "month";

  // Use date_trunc for grouping — works on Postgres (prod) and PGlite
  const rows = await db
    .select({
      period: sql<string>`to_char(date_trunc(${sql.raw(`'${truncUnit}'`)}, ${payments.paidAt}), 'YYYY-MM-DD')`,
      amountCents: sum(payments.amountCents),
    })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, "paid"),
        gte(payments.paidAt, since),
        isNotNull(payments.paidAt)
      )
    )
    .groupBy(sql`date_trunc(${sql.raw(`'${truncUnit}'`)}, ${payments.paidAt})`)
    .orderBy(sql`date_trunc(${sql.raw(`'${truncUnit}'`)}, ${payments.paidAt})`);

  const series = (Array.isArray(rows) ? rows : []).map((r) => ({
    period: r.period ?? "",
    amountCents: Number(r.amountCents ?? 0),
  }));

  return c.json({ series, granularity, months });
});

// ─── INTEG-104: Revenue by course ────────────────────────────────────────────

/**
 * GET /api/analytics/revenue-by-course
 * Revenue per course (sum of paid payments with course_id set).
 * Requires INTEG-102 (payments.courseId) and courses table.
 */
analyticsRoutes.get("/revenue-by-course", async (c) => {
  const tenantId = c.get("user").tenantId;

  const rows = await db
    .select({
      courseId: payments.courseId,
      courseName: courses.name,
      totalCents: sum(payments.amountCents),
    })
    .from(payments)
    .leftJoin(courses, eq(payments.courseId, courses.id))
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, "paid"),
        isNotNull(payments.courseId)
      )
    )
    .groupBy(payments.courseId, courses.name)
    .orderBy(sql`sum(${payments.amountCents}) desc`);

  const courseRows = Array.isArray(rows) ? rows : (rows as unknown as { rows: typeof rows }).rows ?? rows;

  const courseList = courseRows.map((r) => ({
    courseId: r.courseId ?? "",
    courseName: r.courseName ?? "Necunoscut",
    totalCents: Number(r.totalCents ?? 0),
  }));

  // Unassigned payments (no courseId)
  const unassignedResult = await db
    .select({ totalCents: sum(payments.amountCents) })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, "paid"),
        isNull(payments.courseId)
      )
    );

  const unassignedRows = Array.isArray(unassignedResult) ? unassignedResult : (unassignedResult as unknown as { rows: typeof unassignedResult }).rows ?? unassignedResult;
  const unassignedCents = Number(unassignedRows[0]?.totalCents ?? 0);

  if (unassignedCents > 0) {
    courseList.push({ courseId: "", courseName: "Neatribuit", totalCents: unassignedCents });
  }

  return c.json({ courses: courseList });
});

// ─── INTEG-104: Student LTV ───────────────────────────────────────────────────

/**
 * GET /api/analytics/student-ltv
 * Average lifetime value per student (total paid revenue / active students).
 */
analyticsRoutes.get("/student-ltv", async (c) => {
  const tenantId = c.get("user").tenantId;

  // Total paid revenue
  const revResult = await db
    .select({ total: sum(payments.amountCents) })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.status, "paid")));

  const revRows = Array.isArray(revResult) ? revResult : (revResult as unknown as { rows: typeof revResult }).rows ?? revResult;
  const totalRevenueCents = Number(revRows[0]?.total ?? 0);

  // Active students count
  const studResult = await db
    .select({ cnt: count(students.id) })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.status, "active")));

  const studRows = Array.isArray(studResult) ? studResult : (studResult as unknown as { rows: typeof studResult }).rows ?? studResult;
  const activeStudents = Number(studRows[0]?.cnt ?? 0);

  const avgLtvCents = activeStudents > 0 ? Math.round(totalRevenueCents / activeStudents) : 0;

  return c.json({ avgLtvCents, totalRevenueCents, activeStudents });
});
