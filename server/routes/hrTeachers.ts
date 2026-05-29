/**
 * HR-402: Teacher stats — hours taught, attendance rate, revenue generated
 */
import { Hono } from "hono";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { teachers, lessons, studentLessons, courses, users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const hrTeacherRoutes = new Hono<{ Variables: AuthVariables }>();

hrTeacherRoutes.use("/*", requireAuth);

/** Parse period string → days */
function periodToDays(period: string): number {
  if (period === "7d") return 7;
  if (period === "30d") return 30;
  if (period === "90d") return 90;
  if (period === "12m") return 365;
  return 30;
}

// ─── GET /api/hr/teacher-stats/:id ───────────────────────────────────────────

hrTeacherRoutes.get("/:id", async (c) => {
  const teacherId = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const period = c.req.query("period") ?? "30d";
  const days = periodToDays(period);

  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // Verify teacher belongs to tenant
  const teacher = await db.query.teachers.findFirst({
    where: and(eq(teachers.id, teacherId), eq(teachers.tenantId, tenantId)),
  });
  if (!teacher) return c.json({ error: "not_found" }, 404);

  // 1. Lessons completed in period
  const [lessonsRow] = await db
    .select({ cnt: count(lessons.id), totalMin: sql<number>`coalesce(sum(${lessons.durationMinutes}), 0)::int` })
    .from(lessons)
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        eq(lessons.teacherId, teacherId),
        eq(lessons.status, "completed"),
        gte(lessons.scheduledAt, periodStart)
      )
    );

  const lessonsCompleted = Number(lessonsRow?.cnt ?? 0);
  const hoursCompleted = Number(lessonsRow?.totalMin ?? 0) / 60;

  // 2. Student attendance rate
  const [presentRow] = await db
    .select({ cnt: count(studentLessons.id) })
    .from(studentLessons)
    .innerJoin(lessons, eq(studentLessons.lessonId, lessons.id))
    .where(
      and(
        eq(studentLessons.tenantId, tenantId),
        eq(lessons.teacherId, teacherId),
        eq(studentLessons.attendanceStatus, "present"),
        gte(lessons.scheduledAt, periodStart)
      )
    );

  const [totalAttRow] = await db
    .select({ cnt: count(studentLessons.id) })
    .from(studentLessons)
    .innerJoin(lessons, eq(studentLessons.lessonId, lessons.id))
    .where(
      and(
        eq(studentLessons.tenantId, tenantId),
        eq(lessons.teacherId, teacherId),
        gte(lessons.scheduledAt, periodStart)
      )
    );

  const presentCount = Number(presentRow?.cnt ?? 0);
  const totalAttCount = Number(totalAttRow?.cnt ?? 0);
  const studentAttendanceRate =
    totalAttCount > 0 ? Math.round((presentCount / totalAttCount) * 100) : 0;

  // 3. Revenue generated = hours × hourlyRate
  const revenueCents = Math.round(hoursCompleted * teacher.hourlyRateCents);

  // 4. Top 5 courses
  const courseStats = await db
    .select({
      courseName: courses.name,
      lessonCount: count(lessons.id),
    })
    .from(lessons)
    .innerJoin(courses, eq(lessons.courseId, courses.id))
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        eq(lessons.teacherId, teacherId),
        gte(lessons.scheduledAt, periodStart)
      )
    )
    .groupBy(courses.id, courses.name)
    .orderBy(sql`count(${lessons.id}) desc`)
    .limit(5);

  const topCourses = (Array.isArray(courseStats) ? courseStats : []).map((r) => ({
    courseName: r.courseName,
    lessonCount: Number(r.lessonCount),
  }));

  // Get teacher name
  const userRow = await db.query.users.findFirst({
    where: eq(users.id, teacher.userId),
    columns: { name: true },
  });

  return c.json({
    teacherId,
    teacherName: userRow?.name ?? "Profesor",
    period,
    lessonsCompleted,
    hoursCompleted: Math.round(hoursCompleted * 10) / 10,
    studentAttendanceRate,
    revenueCents,
    topCourses,
  });
});
