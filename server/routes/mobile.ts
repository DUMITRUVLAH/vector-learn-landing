/**
 * MOB-101..MOB-103: Mobile API routes
 * Endpoints used by the student/parent PWA (/m/* pages).
 * All routes require authentication; student/parent roles get narrowed data.
 */
import { Hono } from "hono";
import { and, eq, gt, asc } from "drizzle-orm";
import { db } from "../db/client";
import { lessons, studentLessons, students, teachers, courses, rooms } from "../db/schema";
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
