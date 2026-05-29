/**
 * CRM-112 — Analytics endpoints (CRM funnel, lost-reasons, ROAS)
 * REP-301 — KPI dashboard (MRR, active students, churn, ARPU + period toggle)
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, count, eq, gte, isNotNull, lt, sql, sum, desc } from "drizzle-orm";
import { db } from "../db/client";
import { leads, adCampaignBudgets, payments, students, lessons, courses, studentLessons } from "../db/schema";
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

// ─── REP-301: KPI Dashboard ───────────────────────────────────────────────────

/** Parse period string (7d, 30d, 90d, 12m) → days */
function periodToDays(period: string): number {
  if (period === "7d") return 7;
  if (period === "30d") return 30;
  if (period === "90d") return 90;
  if (period === "12m") return 365;
  return 30; // default
}

analyticsRoutes.get("/kpi", async (c) => {
  const tenantId = c.get("user").tenantId;
  const period = c.req.query("period") ?? "30d";
  const days = periodToDays(period);

  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevPeriodStart = new Date(periodStart.getTime() - days * 24 * 60 * 60 * 1000);

  // ── MRR: sum of paid payments in period ──
  const [mrrRow] = await db
    .select({ total: sum(payments.amountCents) })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, "paid"),
        gte(payments.paidAt, periodStart)
      )
    );
  const mrrCents = Number(mrrRow?.total ?? 0);

  // Previous period MRR
  const [prevMrrRow] = await db
    .select({ total: sum(payments.amountCents) })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, "paid"),
        gte(payments.paidAt, prevPeriodStart),
        lt(payments.paidAt, periodStart)
      )
    );
  const prevMrrCents = Number(prevMrrRow?.total ?? 0);

  // ── Active students ──
  const [activeRow] = await db
    .select({ cnt: count(students.id) })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.status, "active")));
  const activeStudents = Number(activeRow?.cnt ?? 0);

  // Previous active (for delta — approximation: active count at period start)
  const [prevActiveRow] = await db
    .select({ cnt: count(students.id) })
    .from(students)
    .where(
      and(
        eq(students.tenantId, tenantId),
        eq(students.status, "active"),
        lt(students.createdAt, periodStart) // existed before period
      )
    );
  const prevActiveStudents = Number(prevActiveRow?.cnt ?? 0);

  // ── New students in period ──
  const [newRow] = await db
    .select({ cnt: count(students.id) })
    .from(students)
    .where(
      and(
        eq(students.tenantId, tenantId),
        gte(students.createdAt, periodStart)
      )
    );
  const newStudents = Number(newRow?.cnt ?? 0);

  // ── Churn rate: archived/paused students in period ──
  const [churnRow] = await db
    .select({ cnt: count(students.id) })
    .from(students)
    .where(
      and(
        eq(students.tenantId, tenantId),
        sql`${students.status} IN ('archived', 'paused')`,
        gte(students.updatedAt, periodStart)
      )
    );
  const churnedStudents = Number(churnRow?.cnt ?? 0);
  const startCount = prevActiveStudents + newStudents;
  const churnRatePct = startCount > 0
    ? Math.round((churnedStudents / startCount) * 1000) / 10
    : 0;

  // ── ARPU ──
  const arpuCents = activeStudents > 0 ? Math.round(mrrCents / activeStudents) : 0;

  return c.json({
    period,
    mrrCents,
    activeStudents,
    newStudents,
    churnRatePct,
    arpuCents,
    prevMrrCents,
    prevActiveStudents,
  });
});

// ─── REP-302: Revenue over time ───────────────────────────────────────────────

analyticsRoutes.get("/revenue-over-time", async (c) => {
  const tenantId = c.get("user").tenantId;
  const months = Math.min(Number(c.req.query("months") ?? 12), 24);

  // Generate month labels for last N months
  const now = new Date();
  const monthRows: { month: string; totalCents: number; newStudents: number }[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);

    const [payRow] = await db
      .select({ total: sum(payments.amountCents) })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.status, "paid"),
          gte(payments.paidAt, monthStart),
          lt(payments.paidAt, monthEnd)
        )
      );

    const [studRow] = await db
      .select({ cnt: count(students.id) })
      .from(students)
      .where(
        and(
          eq(students.tenantId, tenantId),
          gte(students.createdAt, monthStart),
          lt(students.createdAt, monthEnd)
        )
      );

    monthRows.push({
      month: monthStr,
      totalCents: Number(payRow?.total ?? 0),
      newStudents: Number(studRow?.cnt ?? 0),
    });
  }

  return c.json({ months: monthRows });
});

// ─── REP-302: Revenue by course (top 10) ─────────────────────────────────────

analyticsRoutes.get("/revenue-by-course", async (c) => {
  const tenantId = c.get("user").tenantId;

  // Revenue per course: sum payments per student, joined via student_lessons → lessons → course
  // Simplified: group payments by student, then join to student_lessons to get course
  // For performance, use a simpler approach: count paid students per course

  const courseStats = await db
    .select({
      courseName: courses.name,
      studentCount: count(studentLessons.studentId),
    })
    .from(studentLessons)
    .innerJoin(lessons, eq(studentLessons.lessonId, lessons.id))
    .innerJoin(courses, eq(lessons.courseId, courses.id))
    .where(eq(lessons.tenantId, tenantId))
    .groupBy(courses.id, courses.name)
    .orderBy(desc(count(studentLessons.studentId)))
    .limit(10);

  // Get payment totals per student for enrolled courses (approximation)
  // For now: MRR-style estimate = count students × avg payment
  const [avgPayRow] = await db
    .select({ avg: sql<number>`coalesce(avg(${payments.amountCents}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), eq(payments.status, "paid")));

  const avgCents = Number(avgPayRow?.avg ?? 0);

  const items = (Array.isArray(courseStats) ? courseStats : []).map((r) => ({
    courseName: r.courseName,
    studentCount: Number(r.studentCount),
    totalCents: Number(r.studentCount) * avgCents, // estimate
  }));

  return c.json({ items });
});

// ─── REP-303: Student LTV ─────────────────────────────────────────────────────

analyticsRoutes.get("/student-ltv", async (c) => {
  const tenantId = c.get("user").tenantId;
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);

  // Get all students with their payment LTV
  const allStudents = await db
    .select({
      id: students.id,
      fullName: students.fullName,
      status: students.status,
      createdAt: students.createdAt,
    })
    .from(students)
    .where(eq(students.tenantId, tenantId))
    .orderBy(students.fullName)
    .limit(limit);

  const result = await Promise.all(
    allStudents.map(async (s) => {
      // LTV = sum paid payments
      const [ltvRow] = await db
        .select({ total: sum(payments.amountCents) })
        .from(payments)
        .where(
          and(
            eq(payments.tenantId, tenantId),
            eq(payments.studentId, s.id),
            eq(payments.status, "paid")
          )
        );

      // Lessons attended
      const [attendRow] = await db
        .select({ cnt: count(studentLessons.id) })
        .from(studentLessons)
        .where(
          and(
            eq(studentLessons.tenantId, tenantId),
            eq(studentLessons.studentId, s.id),
            eq(studentLessons.attendanceStatus, "present")
          )
        );

      // Last lesson date
      const lastLesson = await db
        .select({ scheduledAt: lessons.scheduledAt })
        .from(studentLessons)
        .innerJoin(lessons, eq(studentLessons.lessonId, lessons.id))
        .where(
          and(
            eq(studentLessons.tenantId, tenantId),
            eq(studentLessons.studentId, s.id)
          )
        )
        .orderBy(desc(lessons.scheduledAt))
        .limit(1);

      return {
        studentId: s.id,
        fullName: s.fullName,
        status: s.status,
        ltvCents: Number(ltvRow?.total ?? 0),
        paymentCount: 0, // would need separate count query
        lessonsAttended: Number(attendRow?.cnt ?? 0),
        lastLessonAt: lastLesson[0]?.scheduledAt?.toISOString() ?? null,
      };
    })
  );

  // Sort by LTV desc
  result.sort((a, b) => b.ltvCents - a.ltvCents);

  return c.json({ items: result });
});
