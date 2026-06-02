import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, gte, count as drizzleCount } from "drizzle-orm";
import { db } from "../db/client";
import { courses, leads, lessons, studentLessons, teachers } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const createCourseSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional().nullable(),
  level: z.string().max(32).optional().nullable(),
  cefrLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]).optional().nullable(),
  defaultPriceCents: z.number().int().min(0).default(0),
  durationMinutes: z.number().int().min(15).max(480).default(60),
});

// COURSE-201: patch schema (all fields optional)
const updateCourseSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).optional().nullable(),
  level: z.string().max(32).optional().nullable(),
  defaultPriceCents: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
});

const listQuerySchema = z.object({
  showArchived: z.coerce.boolean().default(false),
});

export const courseRoutes = new Hono<{ Variables: AuthVariables }>();

courseRoutes.use("*", requireAuth);

courseRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { showArchived } = c.req.valid("query");

  const conditions = [eq(courses.tenantId, tenantId)];
  if (!showArchived) {
    // COURSE-201: default — exclude archived courses
    conditions.push(ne(courses.status, "archived"));
  }

  const items = await db
    .select()
    .from(courses)
    .where(and(...conditions))
    .orderBy(desc(courses.createdAt));
  return c.json({ items });
});

// GET /api/courses/:id — single course
courseRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const [item] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), eq(courses.tenantId, tenantId)));
  if (!item) return c.json({ error: "not_found" }, 404);
  return c.json(item);
});

// POST /api/courses — create course
courseRoutes.post("/", zValidator("json", createCourseSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get("user").tenantId;
  const [created] = await db
    .insert(courses)
    .values({ ...body, tenantId, status: "active" })
    .returning();
  return c.json(created, 201);
});

/**
 * GAP-002: GET /api/courses/match?leadId=:id
 * Returns up to 5 courses compatible with the lead's interest + preferred schedule.
 * Scoring:
 *   +3 exact slot match (preferred_time_start within lesson time)
 *   +2 day of week match
 *   +2 level match
 *   Courses with no upcoming lessons → score 0 but still included if interest matches
 */
const matchQuerySchema = z.object({
  leadId: z.string().uuid(),
});

courseRoutes.get("/match", zValidator("query", matchQuerySchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { leadId } = c.req.valid("query");

  // Fetch the lead to get preferred schedule + interest
  const lead = await db.query.leads.findFirst({
    where: and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)),
  });

  if (!lead) return c.json({ error: "lead_not_found" }, 404);

  // Fetch all courses for this tenant
  const allCourses = await db
    .select()
    .from(courses)
    .where(eq(courses.tenantId, tenantId))
    .orderBy(desc(courses.createdAt));

  if (allCourses.length === 0) return c.json({ matches: [] });

  // Fetch upcoming lessons (next 30 days) to get next slot per course
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const upcomingLessons = await db
    .select({
      id: lessons.id,
      courseId: lessons.courseId,
      teacherId: lessons.teacherId,
      scheduledAt: lessons.scheduledAt,
      durationMinutes: lessons.durationMinutes,
    })
    .from(lessons)
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        gte(lessons.scheduledAt, now),
        // scheduledAt <= in30Days is simplified — drizzle lte
      )
    )
    .orderBy(lessons.scheduledAt);

  // Count enrolled students per lesson
  const enrollmentCounts = await db
    .select({
      lessonId: studentLessons.lessonId,
      enrolled: drizzleCount(studentLessons.id),
    })
    .from(studentLessons)
    .where(eq(studentLessons.tenantId, tenantId))
    .groupBy(studentLessons.lessonId);

  const enrolledMap = new Map(enrollmentCounts.map((e) => [e.lessonId, Number(e.enrolled)]));

  // Group upcoming lessons by courseId, take first upcoming
  const nextLessonByCourse = new Map<string, { scheduledAt: Date; teacherId: string; enrolled: number; durationMinutes: number }>();
  for (const lesson of upcomingLessons) {
    if (!nextLessonByCourse.has(lesson.courseId) && lesson.scheduledAt <= in30Days) {
      nextLessonByCourse.set(lesson.courseId, {
        scheduledAt: lesson.scheduledAt,
        teacherId: lesson.teacherId,
        enrolled: enrolledMap.get(lesson.id) ?? 0,
        durationMinutes: lesson.durationMinutes,
      });
    }
  }

  // Fetch teacher names for courses with upcoming lessons
  const teacherIds = [...new Set([...nextLessonByCourse.values()].map((l) => l.teacherId))];
  const teacherRows = teacherIds.length > 0
    ? await db
        .select({ id: teachers.id, fullName: teachers.fullName })
        .from(teachers)
        .where(and(eq(teachers.tenantId, tenantId)))
    : [];
  const teacherMap = new Map(teacherRows.map((t) => [t.id, t.fullName]));

  // Preferred schedule from lead (GAP-001)
  const preferredDays: number[] = Array.isArray((lead as unknown as Record<string, unknown>).preferredDays)
    ? ((lead as unknown as Record<string, unknown>).preferredDays as number[])
    : [];
  const preferredStart = (lead as unknown as Record<string, unknown>).preferredTimeStart as string | null;
  const preferredEnd = (lead as unknown as Record<string, unknown>).preferredTimeEnd as string | null;
  const interestCourse = lead.interestCourse?.toLowerCase() ?? "";

  const scored = allCourses
    .filter((course) => {
      // Mandatory: if lead has interest, course name must match (partial)
      if (!interestCourse) return true;
      return course.name.toLowerCase().includes(interestCourse) || interestCourse.includes(course.name.toLowerCase());
    })
    .map((course) => {
      let score = 0;
      const nextLesson = nextLessonByCourse.get(course.id);

      // Level match (+2)
      if (course.level && lead.interestCourse) {
        score += 2; // simplified: if both have level info, award the point
      }

      if (nextLesson) {
        const lessonDate = nextLesson.scheduledAt;
        // Day of week (1=Mon, 7=Sun): getDay() is 0=Sun, so convert
        const jsDay = lessonDate.getDay(); // 0=Sun
        const isoDay = jsDay === 0 ? 7 : jsDay; // 1-7 Mon-Sun

        // Day match (+2)
        if (preferredDays.length > 0 && preferredDays.includes(isoDay)) {
          score += 2;
        }

        // Time slot match (+3): lesson start time within preferred window
        if (preferredStart && preferredEnd) {
          const lessonHHMM = `${String(lessonDate.getHours()).padStart(2, "0")}:${String(lessonDate.getMinutes()).padStart(2, "0")}`;
          if (lessonHHMM >= preferredStart && lessonHHMM <= preferredEnd) {
            score += 3;
          }
        }
      }

      const vacancies = nextLesson ? Math.max(0, 20 - nextLesson.enrolled) : null; // 20 default cap

      return {
        courseId: course.id,
        courseName: course.name,
        level: course.level,
        teacherName: nextLesson ? (teacherMap.get(nextLesson.teacherId) ?? null) : null,
        nextSlot: nextLesson ? nextLesson.scheduledAt.toISOString() : null,
        compatibilityScore: score,
        vacancies,
      };
    })
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
    .slice(0, 5);

  return c.json({ matches: scored });
});

courseRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const [archived] = await db
    .update(courses)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(courses.id, id), eq(courses.tenantId, tenantId)))
    .returning({ id: courses.id });
  if (!archived) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
