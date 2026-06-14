/**
 * CRM-112 — Analytics endpoints
 * GET /api/analytics/crm/funnel — conversion funnel
 * GET /api/analytics/crm/lost-reasons — lost reason aggregation
 * GET /api/analytics/crm/roas — ROAS per campaign
 * POST /api/analytics/crm/budgets — set ad spend per campaign+month
 *
 * BRANCH-704 — Branch KPI analytics
 * GET /api/analytics/branches — per-branch KPIs (MRR, active students, lessons this month)
 *
 * INSIGHT-002 (FIN) — FinDesk Insights metrici
 * GET /api/analytics/fin/metrics       — venituri/receivable/profit per perioadă
 * GET /api/analytics/fin/aging         — aging receivable 0-30/31-60/61-90/90+z
 * GET /api/analytics/fin/cashflow-forecast — forecast 60z 3 scenarii DETERMINISTE
 * GET /api/analytics/fin/saved-views   — lista vederi salvate fin_saved_views
 * POST /api/analytics/fin/saved-views  — creare vedere salvată
 * GET /api/analytics/fin/narratives    — lista narativele anului
 * PUT /api/analytics/fin/narratives/:month — upsert narativă
 *
 * INSIGHT-003 (FIN) — AI narativă CFO
 * POST /api/analytics/fin/ai-narrative  — generare narativă AI din date reale DB
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, count, eq, gte, isNotNull, lt, lte, sql, sum, gt, ne, isNull, inArray, desc } from "drizzle-orm";
import { db } from "../db/client";
import {
  leads, adCampaignBudgets, pipelineStages,
  lessons, courses, teachers, invoices, students, studentLessons,
  branches, payments, users,
} from "../db/schema";
import { finSavedViews, finNarratives } from "../db/schema/finInsight";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { callAi } from "../lib/ai/client";

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

// ─── GAP-016: Retention by course ─────────────────────────────────────────────
// GET /api/analytics/retention-by-course
// Returns per course: active students today vs 30 days ago, retentionPct

analyticsRoutes.get("/retention-by-course", async (c) => {
  const tenantId = c.get("user").tenantId;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const nowISO = now.toISOString();
  const thirtyISO = thirtyDaysAgo.toISOString();
  const sixtyISO = sixtyDaysAgo.toISOString();

  // Get all courses for tenant
  const courseList = await db
    .select({ id: courses.id, name: courses.name })
    .from(courses)
    .where(eq(courses.tenantId, tenantId));

  if (courseList.length === 0) return c.json([]);

  // Active students "now" = had a lesson in the last 30 days
  const activeNowRows = await db
    .select({ courseId: lessons.courseId, studentId: studentLessons.studentId })
    .from(studentLessons)
    .innerJoin(lessons, eq(studentLessons.lessonId, lessons.id))
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        gte(lessons.scheduledAt, sql`${thirtyISO}::timestamptz`),
        lte(lessons.scheduledAt, sql`${nowISO}::timestamptz`),
      )
    );

  // Active students "30 days ago" = had a lesson in the 30-day window ending 30 days ago
  const activeThenRows = await db
    .select({ courseId: lessons.courseId, studentId: studentLessons.studentId })
    .from(studentLessons)
    .innerJoin(lessons, eq(studentLessons.lessonId, lessons.id))
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        gte(lessons.scheduledAt, sql`${sixtyISO}::timestamptz`),
        lte(lessons.scheduledAt, sql`${thirtyISO}::timestamptz`),
      )
    );

  const nowRows = Array.isArray(activeNowRows) ? activeNowRows : (activeNowRows as unknown as typeof activeNowRows);
  const thenRows = Array.isArray(activeThenRows) ? activeThenRows : (activeThenRows as unknown as typeof activeThenRows);

  type ActiveRow = { courseId: string; studentId: string };

  // Count unique students per course
  const setNow = new Map<string, Set<string>>();
  const setThen = new Map<string, Set<string>>();
  for (const r of (nowRows as ActiveRow[])) {
    if (!setNow.has(r.courseId)) setNow.set(r.courseId, new Set());
    setNow.get(r.courseId)!.add(r.studentId);
  }
  for (const r of (thenRows as ActiveRow[])) {
    if (!setThen.has(r.courseId)) setThen.set(r.courseId, new Set());
    setThen.get(r.courseId)!.add(r.studentId);
  }

  const result = courseList.map((course) => {
    const nowCount = setNow.get(course.id)?.size ?? 0;
    const thenCount = setThen.get(course.id)?.size ?? 0;
    const retentionPct = thenCount > 0 ? Math.round((nowCount / thenCount) * 100) : null;
    const trend = retentionPct === null ? "stable" : retentionPct >= 80 ? "up" : retentionPct >= 60 ? "stable" : "down";
    return {
      courseId: course.id,
      courseName: course.name,
      activeNow: nowCount,
      activePrev: thenCount,
      retentionPct,
      trend,
    };
  });

  return c.json(result);
});

// ─── GAP-016: Revenue by teacher ──────────────────────────────────────────────
// GET /api/analytics/revenue-by-teacher
// Returns per teacher: sum of paid invoices in last 30 days (approx via student_lessons)

analyticsRoutes.get("/revenue-by-teacher", async (c) => {
  const tenantId = c.get("user").tenantId;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const thirtyISO = thirtyDaysAgo.toISOString();
  const nowISO = now.toISOString();

  // All teachers in tenant (join users to get name)
  const teacherList = await db
    .select({ id: teachers.id, name: users.name })
    .from(teachers)
    .innerJoin(users, eq(teachers.userId, users.id))
    .where(eq(teachers.tenantId, tenantId));

  if (teacherList.length === 0) return c.json([]);

  // Get lessons in last 30 days per teacher + count students enrolled
  const lessonRows = await db
    .select({
      teacherId: lessons.teacherId,
      lessonId: lessons.id,
    })
    .from(lessons)
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        ne(lessons.status, "cancelled"),
        gte(lessons.scheduledAt, sql`${thirtyISO}::timestamptz`),
        lte(lessons.scheduledAt, sql`${nowISO}::timestamptz`),
      )
    );

  type LessonRow = { teacherId: string; lessonId: string };
  const lessonsArr = Array.isArray(lessonRows) ? lessonRows : (lessonRows as unknown as LessonRow[]);

  // Get paid invoices in last 30 days
  const paidInvoiceRows = await db
    .select({
      studentId: invoices.studentId,
      amountCents: invoices.amountCents,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.status, "paid"),
        gte(invoices.createdAt, sql`${thirtyISO}::timestamptz`),
      )
    );

  type InvoiceRow = { studentId: string; amountCents: number };
  const invArr = Array.isArray(paidInvoiceRows) ? paidInvoiceRows : (paidInvoiceRows as unknown as InvoiceRow[]);

  // Build student → paid revenue map
  const studentRevMap = new Map<string, number>();
  for (const inv of (invArr as InvoiceRow[])) {
    studentRevMap.set(inv.studentId, (studentRevMap.get(inv.studentId) ?? 0) + Number(inv.amountCents));
  }

  // Get enrollments for those lessons
  const lessonIds = (lessonsArr as LessonRow[]).map((r) => r.lessonId);
  type SlRow = { lessonId: string; studentId: string };
  let slRows: SlRow[] = [];
  if (lessonIds.length > 0) {
    const slResult = await db
      .select({ lessonId: studentLessons.lessonId, studentId: studentLessons.studentId })
      .from(studentLessons)
      .where(
        and(
          eq(studentLessons.tenantId, tenantId),
          sql`${studentLessons.lessonId} = ANY(ARRAY[${sql.join(lessonIds.map((id) => sql`${id}::uuid`), sql`, `)}])`
        )
      );
    slRows = Array.isArray(slResult) ? slResult : (slResult as unknown as SlRow[]);
  }

  // Build lesson → teacher map
  const lessonTeacher = new Map<string, string>();
  for (const lr of (lessonsArr as LessonRow[])) {
    lessonTeacher.set(lr.lessonId, lr.teacherId);
  }

  // Aggregate revenue per teacher (students taught by this teacher × their paid invoices)
  const teacherRevMap = new Map<string, { revCents: number; lessonCount: number }>();
  const countedPairs = new Set<string>();

  for (const sl of (slRows as SlRow[])) {
    const teacherId = lessonTeacher.get(sl.lessonId);
    if (!teacherId) continue;
    const rev = studentRevMap.get(sl.studentId) ?? 0;
    // Avoid counting same student revenue multiple times per teacher
    const pairKey = `${teacherId}:${sl.studentId}`;
    if (!countedPairs.has(pairKey)) {
      countedPairs.add(pairKey);
      const existing = teacherRevMap.get(teacherId) ?? { revCents: 0, lessonCount: 0 };
      teacherRevMap.set(teacherId, { revCents: existing.revCents + rev, lessonCount: existing.lessonCount });
    }
  }
  // Count lessons per teacher
  for (const lr of (lessonsArr as LessonRow[])) {
    const existing = teacherRevMap.get(lr.teacherId) ?? { revCents: 0, lessonCount: 0 };
    teacherRevMap.set(lr.teacherId, { ...existing, lessonCount: existing.lessonCount + 1 });
  }

  const result = teacherList.map((teacher) => {
    const data = teacherRevMap.get(teacher.id) ?? { revCents: 0, lessonCount: 0 };
    return {
      teacherId: teacher.id,
      teacherName: teacher.name,
      revenueRon: Math.round(data.revCents / 100),
      lessonCount: data.lessonCount,
    };
  });

  return c.json(result);
});

// ─── GAP-016: Churn risk ──────────────────────────────────────────────────────
// GET /api/analytics/churn-risk
// Top 20 students by churn risk score (based on absences, inactivity, debt)

analyticsRoutes.get("/churn-risk", async (c) => {
  const tenantId = c.get("user").tenantId;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyISO = thirtyDaysAgo.toISOString();
  const fourteenISO = fourteenDaysAgo.toISOString();
  const nowISO = now.toISOString();

  // Get active students
  const activeStudents = await db
    .select({ id: students.id, name: students.fullName, debtCents: students.debtCents })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.status, "active")));

  type StudentRow = { id: string; name: string; debtCents: number | null };
  const stuArr = Array.isArray(activeStudents) ? activeStudents : (activeStudents as unknown as StudentRow[]);

  if ((stuArr as StudentRow[]).length === 0) return c.json([]);

  // Count unexcused absences per student in last 30 days
  const absenceRows = await db
    .select({
      studentId: studentLessons.studentId,
      cnt: count(studentLessons.id),
    })
    .from(studentLessons)
    .innerJoin(lessons, eq(studentLessons.lessonId, lessons.id))
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        eq(studentLessons.attendanceStatus, "absent"),
        gte(lessons.scheduledAt, sql`${thirtyISO}::timestamptz`),
        lte(lessons.scheduledAt, sql`${nowISO}::timestamptz`),
      )
    )
    .groupBy(studentLessons.studentId);

  type AbsRow = { studentId: string; cnt: number };
  const absArr = Array.isArray(absenceRows) ? absenceRows : (absenceRows as unknown as AbsRow[]);

  // Last lesson date per student
  const lastLessonRows = await db
    .select({
      studentId: studentLessons.studentId,
      lastAt: sql<string>`max(${lessons.scheduledAt})`,
    })
    .from(studentLessons)
    .innerJoin(lessons, eq(studentLessons.lessonId, lessons.id))
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        lte(lessons.scheduledAt, sql`${nowISO}::timestamptz`),
      )
    )
    .groupBy(studentLessons.studentId);

  type LastRow = { studentId: string; lastAt: string };
  const lastArr = Array.isArray(lastLessonRows) ? lastLessonRows : (lastLessonRows as unknown as LastRow[]);

  const absMap = new Map<string, number>();
  for (const r of (absArr as AbsRow[])) absMap.set(r.studentId, Number(r.cnt));

  const lastMap = new Map<string, Date>();
  for (const r of (lastArr as LastRow[])) lastMap.set(r.studentId, new Date(r.lastAt));

  const riskItems = (stuArr as StudentRow[]).map((s) => {
    const absences = absMap.get(s.id) ?? 0;
    const lastLesson = lastMap.get(s.id);
    const debtCents = Number(s.debtCents ?? 0);

    const reasons: string[] = [];
    let score = 0;

    // Factor 1: absences ≥ 3 (weight 40)
    if (absences >= 3) {
      reasons.push(`${absences} absențe nemotivate (30 zile)`);
      score += Math.min(40, absences * 10);
    }

    // Factor 2: no lesson in last 14 days (weight 35)
    if (!lastLesson || lastLesson < fourteenDaysAgo) {
      reasons.push("Inactiv 14+ zile");
      score += 35;
    }

    // Factor 3: has debt (weight 25)
    if (debtCents > 0) {
      reasons.push(`Datorie ${Math.round(debtCents / 100)} RON`);
      score += 25;
    }

    return {
      studentId: s.id,
      name: s.name,
      riskScore: Math.min(100, score),
      reasons,
    };
  });

  // Only return students with risk > 0, sorted by score desc, top 20
  const result = riskItems
    .filter((r) => r.riskScore > 0)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 20);

  return c.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHT-002 (FIN): FinDesk Insights — metrici financiare
// ─────────────────────────────────────────────────────────────────────────────

/** Calculează data de start pentru o perioadă. DETERMINIST — FIN-CORE regula #4. */
function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case "this_month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "last_month":
      return new Date(now.getFullYear(), now.getMonth() - 1, 1);
    case "last_3m":
      return new Date(now.getFullYear(), now.getMonth() - 3, 1);
    case "last_6m":
      return new Date(now.getFullYear(), now.getMonth() - 6, 1);
    case "ytd":
      return new Date(now.getFullYear(), 0, 1);
    default:
      return new Date(now.getFullYear(), now.getMonth() - 6, 1);
  }
}

/** Calculează data de final pentru o perioadă. */
function getPeriodEnd(period: string): Date {
  const now = new Date();
  if (period === "last_month") {
    return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  }
  return now;
}

/** Formatează o dată ca YYYY-MM pentru groupBy=month. */
function toYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/analytics/fin/metrics — venituri/receivable/profit per perioadă
analyticsRoutes.get("/fin/metrics", async (c) => {
  const tenantId = c.get("user").tenantId;
  const period = c.req.query("period") ?? "last_6m";
  const groupBy = (c.req.query("groupBy") ?? "month") as "month" | "day";

  const start = getPeriodStart(period);
  const end = getPeriodEnd(period);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  // Revenue = payments status='paid' in interval
  const revenueRows = await db
    .select({
      amountCents: payments.amountCents,
      paidAt: payments.paidAt,
    })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, "paid"),
        isNotNull(payments.paidAt),
        gte(payments.paidAt, sql`${startISO}::timestamptz`),
        lte(payments.paidAt, sql`${endISO}::timestamptz`)
      )
    );

  // Receivable = invoices status='issued' in interval (outstanding)
  const receivableRows = await db
    .select({
      amountCents: invoices.amountCents,
      issueDate: invoices.issueDate,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.status, "issued"),
        gte(invoices.issueDate, sql`${startISO}::timestamptz`),
        lte(invoices.issueDate, sql`${endISO}::timestamptz`)
      )
    );

  // Aggregate by period bucket (DETERMINIST)
  const buckets: Record<string, { revenue: number; receivable: number }> = {};

  const addToBucket = (
    date: Date,
    field: "revenue" | "receivable",
    cents: number
  ) => {
    const key = groupBy === "month"
      ? toYearMonth(date)
      : date.toISOString().substring(0, 10);
    if (!buckets[key]) buckets[key] = { revenue: 0, receivable: 0 };
    buckets[key][field] += cents;
  };

  const revArr = Array.isArray(revenueRows) ? revenueRows : [];
  const rcvArr = Array.isArray(receivableRows) ? receivableRows : [];

  for (const r of revArr) {
    if (r.paidAt) addToBucket(new Date(r.paidAt as Date), "revenue", r.amountCents);
  }
  for (const r of rcvArr) {
    if (r.issueDate) addToBucket(new Date(r.issueDate as Date), "receivable", r.amountCents);
  }

  const metrics = Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([p, data]) => ({
      period: p,
      revenue: data.revenue,
      receivable: data.receivable,
      // Profit approximation: revenue - receivable (DETERMINIST, simplified)
      profit: data.revenue - data.receivable,
    }));

  return c.json({ metrics, period, groupBy });
});

// GET /api/analytics/fin/aging — aging receivable
analyticsRoutes.get("/fin/aging", async (c) => {
  const tenantId = c.get("user").tenantId;
  const now = new Date();
  const nowISO = now.toISOString();

  const overdueRows = await db
    .select({
      amountCents: invoices.amountCents,
      dueDate: invoices.dueDate,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.tenantId, tenantId),
        inArray(invoices.status, ["issued", "draft"]),
        isNotNull(invoices.dueDate),
        lt(invoices.dueDate, sql`${nowISO}::timestamptz`)
      )
    );

  const overdueArr = Array.isArray(overdueRows) ? overdueRows : [];

  const aging = { "0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0, total: 0 };

  for (const row of overdueArr) {
    if (!row.dueDate) continue;
    const daysOverdue = Math.floor(
      (now.getTime() - new Date(row.dueDate as Date).getTime()) / (1000 * 60 * 60 * 24)
    );
    const cents = row.amountCents;
    aging.total += cents;
    if (daysOverdue <= 30) aging["0_30"] += cents;
    else if (daysOverdue <= 60) aging["31_60"] += cents;
    else if (daysOverdue <= 90) aging["61_90"] += cents;
    else aging["90_plus"] += cents;
  }

  return c.json({ aging });
});

// GET /api/analytics/fin/cashflow-forecast — forecast 60z, 3 scenarii DETERMINISTE
analyticsRoutes.get("/fin/cashflow-forecast", async (c) => {
  const tenantId = c.get("user").tenantId;
  const now = new Date();

  // Baza: media veniturilor săptămânale din ultimele 12 săptămâni (DETERMINIST)
  const twelveWeeksAgo = new Date(now.getTime() - 12 * 7 * 24 * 60 * 60 * 1000);
  const twelveWeeksISO = twelveWeeksAgo.toISOString();
  const nowISO = now.toISOString();

  const paidRows = await db
    .select({ amountCents: payments.amountCents })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        eq(payments.status, "paid"),
        isNotNull(payments.paidAt),
        gte(payments.paidAt, sql`${twelveWeeksISO}::timestamptz`),
        lte(payments.paidAt, sql`${nowISO}::timestamptz`)
      )
    );

  const paidArr = Array.isArray(paidRows) ? paidRows : [];
  const totalCents = paidArr.reduce((s, r) => s + r.amountCents, 0);
  const weeklyAvgCents = Math.round(totalCents / 12);
  const dailyBase = Math.round(weeklyAvgCents / 7);
  const dailyGood = Math.round(dailyBase * 1.2);
  const dailyPessimistic = Math.round(dailyBase * 0.8);

  type ForecastDay = { date: string; cumulativeCents: number };
  const base: ForecastDay[] = [];
  const good: ForecastDay[] = [];
  const pessimistic: ForecastDay[] = [];

  let cumBase = 0, cumGood = 0, cumPessimistic = 0;

  for (let i = 0; i < 60; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().substring(0, 10);

    cumBase += dailyBase;
    cumGood += dailyGood;
    cumPessimistic += dailyPessimistic;

    base.push({ date: dateStr, cumulativeCents: cumBase });
    good.push({ date: dateStr, cumulativeCents: cumGood });
    pessimistic.push({ date: dateStr, cumulativeCents: cumPessimistic });
  }

  return c.json({
    scenarios: { good, base, pessimistic },
    weeklyAvgCents,
    generatedAt: now.toISOString(),
  });
});

// ─── fin_saved_views CRUD ─────────────────────────────────────────────────────

// GET /api/analytics/fin/saved-views
analyticsRoutes.get("/fin/saved-views", async (c) => {
  const tenantId = c.get("user").tenantId;
  const userId = c.get("user").id;

  const views = await db.query.finSavedViews.findMany({
    where: and(
      eq(finSavedViews.tenantId, tenantId),
      sql`(${finSavedViews.userId} = ${userId}::uuid OR ${finSavedViews.isPublic} = true)`
    ),
    orderBy: [desc(finSavedViews.updatedAt)],
  });

  return c.json({ views });
});

const createSavedViewSchema = z.object({
  name: z.string().min(1).max(200),
  metric: z.enum(["revenue", "expenses", "profit", "vat", "cashflow"]),
  period: z.enum(["this_month", "last_month", "last_3m", "last_6m", "ytd", "custom"]).default("this_month"),
  groupBy: z.enum(["day", "week", "month", "category"]).default("month"),
  filters: z.record(z.unknown()).default({}),
  isDefault: z.boolean().default(false),
  isPublic: z.boolean().default(false),
});

// POST /api/analytics/fin/saved-views
analyticsRoutes.post(
  "/fin/saved-views",
  zValidator("json", createSavedViewSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const userId = c.get("user").id;
    const data = c.req.valid("json");

    const [view] = await db
      .insert(finSavedViews)
      .values({
        tenantId,
        userId,
        name: data.name,
        metric: data.metric,
        period: data.period,
        groupBy: data.groupBy,
        filters: data.filters as { accountType?: string; category?: string },
        isDefault: data.isDefault,
        isPublic: data.isPublic,
      })
      .returning();

    return c.json({ view }, 201);
  }
);

// ─── fin_narratives CRUD ──────────────────────────────────────────────────────

// GET /api/analytics/fin/narratives
analyticsRoutes.get("/fin/narratives", async (c) => {
  const tenantId = c.get("user").tenantId;
  const year = c.req.query("year") ?? new Date().getFullYear().toString();

  const narratives = await db.query.finNarratives.findMany({
    where: and(
      eq(finNarratives.tenantId, tenantId),
      sql`left(${finNarratives.month}, 4) = ${year}`
    ),
    orderBy: [desc(finNarratives.month)],
  });

  return c.json({ narratives });
});

const upsertNarrativeSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().min(1),
  generatedBy: z.enum(["manual", "ai"]).default("manual"),
  sentiment: z.enum(["positive", "neutral", "negative"]).default("neutral"),
  publishedAt: z.string().datetime().optional().nullable(),
});

// PUT /api/analytics/fin/narratives/:month
analyticsRoutes.put(
  "/fin/narratives/:month",
  zValidator("json", upsertNarrativeSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const userId = c.get("user").id;
    const month = c.req.param("month");

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return c.json({ error: "Format lună invalid. Folosiți YYYY-MM." }, 422);
    }

    const data = c.req.valid("json");

    // Upsert: insert or update by (tenant_id, month) unique constraint
    const existing = await db.query.finNarratives.findFirst({
      where: and(
        eq(finNarratives.tenantId, tenantId),
        eq(finNarratives.month, month)
      ),
    });

    let narrative;
    if (existing) {
      const [updated] = await db
        .update(finNarratives)
        .set({
          title: data.title,
          body: data.body,
          generatedBy: data.generatedBy,
          sentiment: data.sentiment,
          publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(finNarratives.id, existing.id),
            eq(finNarratives.tenantId, tenantId)
          )
        )
        .returning();
      narrative = updated;
    } else {
      const [inserted] = await db
        .insert(finNarratives)
        .values({
          tenantId,
          authorId: userId,
          month,
          title: data.title,
          body: data.body,
          generatedBy: data.generatedBy,
          sentiment: data.sentiment,
          publishedAt: data.publishedAt ? new Date(data.publishedAt) : null,
        })
        .returning();
      narrative = inserted;
    }

    return c.json({ narrative });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHT-003 (FIN): AI narativă CFO — generare din date REALE din DB
// FIN-CORE regula #4: AI narează, nu calculează. Cifrele vin din query determinist.
// ─────────────────────────────────────────────────────────────────────────────

const aiNarrativeSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Format lună invalid. Folosiți YYYY-MM.")
    .optional(),
});

// POST /api/analytics/fin/ai-narrative
analyticsRoutes.post(
  "/fin/ai-narrative",
  zValidator("json", aiNarrativeSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const userId = user.id;

    const { month: requestedMonth } = c.req.valid("json");

    // Default: luna curentă
    const now = new Date();
    const month =
      requestedMonth ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return c.json({ error: "Format lună invalid. Folosiți YYYY-MM." }, 422);
    }

    // ── AC4: 409 dacă există narativă manuală ─────────────────────────────────
    const existingNarrative = await db.query.finNarratives.findFirst({
      where: and(
        eq(finNarratives.tenantId, tenantId),
        eq(finNarratives.month, month)
      ),
    });

    if (existingNarrative && existingNarrative.generatedBy === "manual") {
      return c.json(
        {
          error:
            "Narativă manuală existentă. Șterge-o mai întâi dacă vrei să o înlocuiești cu AI.",
        },
        409
      );
    }

    // ── Calcul DETERMINIST (FIN-CORE regula #4) ────────────────────────────────
    // Interval: prima zi a lunii → ultima zi a lunii
    const [year, monthNum] = month.split("-").map(Number);
    const periodStart = new Date(year, monthNum - 1, 1);
    const periodEnd = new Date(year, monthNum, 0, 23, 59, 59); // ultima zi a lunii

    // Revenue: payments status='paid' în luna curentă
    const revenueRows = await db
      .select({ total: sql<string>`COALESCE(SUM(${payments.amountCents}), 0)` })
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.status, "paid"),
          gte(payments.paidAt, periodStart),
          lte(payments.paidAt, periodEnd)
        )
      );
    const revenue = Number(revenueRows[0]?.total ?? 0);

    // Receivable: invoices status='issued' emise în luna curentă
    const receivableRows = await db
      .select({ total: sql<string>`COALESCE(SUM(${invoices.amountCents}), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.status, "issued"),
          gte(invoices.issueDate, periodStart),
          lte(invoices.issueDate, periodEnd)
        )
      );
    const receivable = Number(receivableRows[0]?.total ?? 0);

    const profit = revenue - receivable;

    // Aging 0-30 și 90+ (totale din tabel, nu limitate la lună — starea curentă)
    const today = new Date();
    const day30 = new Date(today);
    day30.setDate(today.getDate() - 30);
    const day90 = new Date(today);
    day90.setDate(today.getDate() - 90);

    const aging030Rows = await db
      .select({ total: sql<string>`COALESCE(SUM(${invoices.amountCents}), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          inArray(invoices.status, ["issued", "draft"]),
          lt(invoices.dueDate, today),
          gte(invoices.dueDate, day30)
        )
      );
    const aging030 = Number(aging030Rows[0]?.total ?? 0);

    const aging90plusRows = await db
      .select({ total: sql<string>`COALESCE(SUM(${invoices.amountCents}), 0)` })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          inArray(invoices.status, ["issued", "draft"]),
          lt(invoices.dueDate, day90)
        )
      );
    const aging90plus = Number(aging90plusRows[0]?.total ?? 0);

    const agingTotal = aging030 + aging90plus;

    // Top surse venit (group by course name via lessons join, max 3)
    // Simplu: top categorii din payments prin curs
    const topSourceRows = await db
      .select({
        name: courses.name,
        total: sql<string>`COALESCE(SUM(${payments.amountCents}), 0)`,
      })
      .from(payments)
      .leftJoin(courses, eq(payments.courseId, courses.id))
      .where(
        and(
          eq(payments.tenantId, tenantId),
          eq(payments.status, "paid"),
          gte(payments.paidAt, periodStart),
          lte(payments.paidAt, periodEnd)
        )
      )
      .groupBy(courses.name)
      .orderBy(desc(sql<number>`SUM(${payments.amountCents})`))
      .limit(3);

    const topSources = topSourceRows
      .map((r) => `${r.name ?? "Alte surse"}: ${Math.round(Number(r.total) / 100)} MDL`)
      .join(", ");

    // ── Construiește prompt cu date reale ──────────────────────────────────────
    const revenueMDL = (revenue / 100).toFixed(0);
    const receivableMDL = (receivable / 100).toFixed(0);
    const profitMDL = (profit / 100).toFixed(0);
    const aging030MDL = (aging030 / 100).toFixed(0);
    const aging90plusMDL = (aging90plus / 100).toFixed(0);

    const systemPrompt =
      "Ești CFO-ul unui centru educațional. Scrie narativă concisă pentru boardul de directori. " +
      "Folosești EXCLUSIV datele furnizate — nu inventa cifre sau fapte. Scrie în română, 3-5 propoziții.";

    const userMessage =
      `Luna ${month}: ` +
      `Venituri încasate: ${revenueMDL} MDL, ` +
      `Creanțe emise: ${receivableMDL} MDL, ` +
      `Profit estimat: ${profitMDL} MDL. ` +
      `Restanțe 0-30 zile: ${aging030MDL} MDL, ` +
      `Restanțe >90 zile: ${aging90plusMDL} MDL. ` +
      (topSources ? `Top surse venit: ${topSources}. ` : "") +
      "Scrie narativa performanței financiare pentru board, în română.";

    // ── Apel AI (cu fallback stub) ─────────────────────────────────────────────
    const aiResult = await callAi({
      action: "fin_narrative",
      systemPrompt,
      userMessage,
      tenantId,
      userId,
      entityType: "fin_narrative",
      entityId: month,
      maxTokens: 512,
    });

    // ── Detectare sentiment DETERMINIST ───────────────────────────────────────
    let sentiment: "positive" | "neutral" | "negative" = "neutral";
    if (profit > 0 && receivable <= revenue * 0.2) {
      sentiment = "positive";
    } else if (receivable > revenue * 0.3 || aging90plus > 0) {
      sentiment = "negative";
    }

    // ── Upsert în fin_narratives ───────────────────────────────────────────────
    const title = `Narativă AI — ${month}`;

    let narrative;
    if (existingNarrative) {
      // Există narativă AI — o suprascriem
      const [updated] = await db
        .update(finNarratives)
        .set({
          title,
          body: aiResult.text,
          generatedBy: "ai",
          sentiment,
          publishedAt: null, // draft — directorul aprobă
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(finNarratives.id, existingNarrative.id),
            eq(finNarratives.tenantId, tenantId)
          )
        )
        .returning();
      narrative = updated;
    } else {
      const [inserted] = await db
        .insert(finNarratives)
        .values({
          tenantId,
          authorId: userId,
          month,
          title,
          body: aiResult.text,
          generatedBy: "ai",
          sentiment,
          publishedAt: null, // draft
        })
        .returning();
      narrative = inserted;
    }

    return c.json({
      narrative,
      auditId: aiResult.auditId,
      isStub: aiResult.isStub,
      metrics: {
        revenue,
        receivable,
        profit,
        agingTotal,
      },
    });
  }
);
