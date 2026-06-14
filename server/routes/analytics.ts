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
import { and, asc, count, eq, gte, isNotNull, lt, lte, sql, sum, gt, ne } from "drizzle-orm";
import { db } from "../db/client";
import {
  leads, adCampaignBudgets, pipelineStages,
  lessons, courses, teachers, invoices, students, studentLessons,
  branches, payments, users,
} from "../db/schema";
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
