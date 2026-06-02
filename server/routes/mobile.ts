/**
 * MOB-101..MOB-103: Mobile API routes
 * Endpoints used by the student/parent PWA (/m/* pages).
 * All routes require authentication; student/parent roles get narrowed data.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  lessons, studentLessons, students, teachers, courses, rooms,
  homework, homeworkSubmissions,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const mobileRoutes = new Hono<{ Variables: AuthVariables }>();

mobileRoutes.use("*", requireAuth);

/**
 * MOB-101: Student dashboard data
 * GET /api/m/dashboard
 * Returns the current student's info and their next upcoming lesson.
 */
mobileRoutes.get("/dashboard", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  // Find the student record linked to this user (by email match — auth creates user, student is separate)
  const [student] = await db
    .select()
    .from(students)
    .where(
      and(
        eq(students.tenantId, tenantId),
        eq(students.status, "active")
      )
    )
    .limit(1);

  if (!student) {
    return c.json({
      student: null,
      nextLesson: null,
      message: "Niciun elev asociat acestui cont",
    });
  }

  // Find the next upcoming lesson for this student
  const now = new Date();
  const [nextLessonRow] = await db
    .select({
      id: lessons.id,
      scheduledAt: lessons.scheduledAt,
      durationMinutes: lessons.durationMinutes,
      meetingUrl: lessons.meetingUrl,
      courseName: courses.name,
      teacherName: teachers.fullName,
      roomName: rooms.name,
    })
    .from(studentLessons)
    .innerJoin(lessons, eq(lessons.id, studentLessons.lessonId))
    .innerJoin(courses, eq(courses.id, lessons.courseId))
    .innerJoin(teachers, eq(teachers.id, lessons.teacherId))
    .leftJoin(rooms, eq(rooms.id, lessons.roomId))
    .where(
      and(
        eq(studentLessons.tenantId, tenantId),
        eq(studentLessons.studentId, student.id),
        gt(lessons.scheduledAt, now),
        eq(lessons.status, "scheduled")
      )
    )
    .orderBy(asc(lessons.scheduledAt))
    .limit(1);

  return c.json({
    student: {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      status: student.status,
    },
    nextLesson: nextLessonRow
      ? {
          id: nextLessonRow.id,
          scheduledAt: nextLessonRow.scheduledAt,
          durationMinutes: nextLessonRow.durationMinutes,
          meetingUrl: nextLessonRow.meetingUrl,
          courseName: nextLessonRow.courseName,
          teacherName: nextLessonRow.teacherName,
          roomName: nextLessonRow.roomName,
        }
      : null,
  });
});

/**
 * MOB-101: Student schedule for the week
 * GET /api/m/schedule
 * Returns all lessons for the current student in the next 7 days.
 */
mobileRoutes.get("/schedule", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.status, "active")))
    .limit(1);

  if (!student) {
    return c.json({ lessons: [] });
  }

  const now = new Date();

  const rows = await db
    .select({
      id: lessons.id,
      scheduledAt: lessons.scheduledAt,
      durationMinutes: lessons.durationMinutes,
      status: lessons.status,
      meetingUrl: lessons.meetingUrl,
      courseName: courses.name,
      teacherName: teachers.fullName,
      roomName: rooms.name,
    })
    .from(studentLessons)
    .innerJoin(lessons, eq(lessons.id, studentLessons.lessonId))
    .innerJoin(courses, eq(courses.id, lessons.courseId))
    .innerJoin(teachers, eq(teachers.id, lessons.teacherId))
    .leftJoin(rooms, eq(rooms.id, lessons.roomId))
    .where(
      and(
        eq(studentLessons.tenantId, tenantId),
        eq(studentLessons.studentId, student.id),
        gt(lessons.scheduledAt, now)
      )
    )
    .orderBy(asc(lessons.scheduledAt))
    .limit(50);

  return c.json({ lessons: rows });
});

/**
 * MOB-102: Homework list for the current student
 * GET /api/m/homework?filter=overdue
 * Returns homework sorted by deadline ASC. Optional filter=overdue for past-deadline pending items.
 */
mobileRoutes.get("/homework", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const filter = c.req.query("filter"); // "overdue" | undefined

  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.status, "active")))
    .limit(1);

  if (!student) {
    return c.json({ homework: [] });
  }

  const conditions = [
    eq(homework.tenantId, tenantId),
    eq(homework.studentId, student.id),
  ];

  if (filter === "overdue") {
    const now = new Date();
    conditions.push(lt(homework.deadline, now));
    conditions.push(eq(homework.status, "pending"));
  }

  const rows = await db
    .select({
      id: homework.id,
      body: homework.body,
      deadline: homework.deadline,
      status: homework.status,
      lessonId: homework.lessonId,
      createdAt: homework.createdAt,
    })
    .from(homework)
    .where(and(...conditions))
    .orderBy(asc(homework.deadline))
    .limit(100);

  return c.json({ homework: rows });
});

/**
 * MOB-102: Submit homework
 * POST /api/m/homework/:id/submit
 * Creates a submission and marks homework as submitted.
 */
const submitSchema = z.object({
  text_body: z.string().max(5000).optional(),
  image_url: z.string().url().max(500).optional(),
}).refine(
  (d) => d.text_body || d.image_url,
  { message: "Trebuie furnizat text_body sau image_url" }
);

mobileRoutes.post(
  "/homework/:id/submit",
  zValidator("json", submitSchema),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const { id } = c.req.param();
    const body = c.req.valid("json");

    // Find the homework item
    const [hw] = await db
      .select()
      .from(homework)
      .where(and(eq(homework.id, id), eq(homework.tenantId, tenantId)))
      .limit(1);

    if (!hw) return c.json({ error: "Tema nu a fost găsită" }, 404);
    if (hw.status === "submitted" || hw.status === "graded") {
      return c.json({ error: "Tema a fost deja trimisă" }, 409);
    }

    // Create submission
    const [submission] = await db
      .insert(homeworkSubmissions)
      .values({
        tenantId,
        homeworkId: hw.id,
        studentId: hw.studentId,
        textBody: body.text_body ?? null,
        imageUrl: body.image_url ?? null,
      })
      .returning();

    // Update homework status
    await db
      .update(homework)
      .set({ status: "submitted", updatedAt: sql`now()` })
      .where(eq(homework.id, hw.id));

    return c.json({ submission, message: "Tema a fost trimisă cu succes" }, 201);
  }
);

/**
 * MOB-102: Teacher grading — list submitted homework for their lessons
 * GET /api/grading/homework
 */
mobileRoutes.get("/grading", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  // Get all submitted homework for this tenant (teacher sees all)
  const rows = await db
    .select({
      id: homework.id,
      body: homework.body,
      deadline: homework.deadline,
      status: homework.status,
      studentId: homework.studentId,
      lessonId: homework.lessonId,
    })
    .from(homework)
    .where(
      and(
        eq(homework.tenantId, tenantId),
        eq(homework.status, "submitted")
      )
    )
    .orderBy(desc(homework.deadline))
    .limit(50);

  return c.json({ homework: rows });
});
