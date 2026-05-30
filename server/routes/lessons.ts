import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import { lessons, courses, teachers, users, students, studentLessons } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const createLessonSchema = z.object({
  courseId: z.string().uuid(),
  teacherId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  meetingUrl: z.string().url().max(500).optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
});

const updateLessonSchema = createLessonSchema.partial();

const listQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export const lessonRoutes = new Hono<{ Variables: AuthVariables }>();

lessonRoutes.use("*", requireAuth);

async function findConflict(
  tenantId: string,
  teacherId: string,
  startISO: string,
  durationMinutes: number,
  excludeLessonId?: string
): Promise<{ id: string; courseId: string; scheduledAt: Date } | null> {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const conditions = [
    eq(lessons.tenantId, tenantId),
    eq(lessons.teacherId, teacherId),
    ne(lessons.status, "cancelled"),
    sql`${lessons.scheduledAt} < ${end.toISOString()}`,
    sql`(${lessons.scheduledAt} + (${lessons.durationMinutes} * interval '1 minute')) > ${start.toISOString()}`,
  ];
  if (excludeLessonId) conditions.push(ne(lessons.id, excludeLessonId));
  const conflicts = await db
    .select({
      id: lessons.id,
      courseId: lessons.courseId,
      scheduledAt: lessons.scheduledAt,
    })
    .from(lessons)
    .where(and(...conditions))
    .limit(1);
  return conflicts[0] ?? null;
}

lessonRoutes.get("/", zValidator("query", listQuerySchema), async (c) => {
  const { from, to } = c.req.valid("query");
  const tenantId = c.get("user").tenantId;
  const conditions = [eq(lessons.tenantId, tenantId)];
  if (from) conditions.push(gte(lessons.scheduledAt, new Date(from)));
  if (to) conditions.push(lt(lessons.scheduledAt, new Date(to)));

  const rows = await db
    .select({
      id: lessons.id,
      courseId: lessons.courseId,
      teacherId: lessons.teacherId,
      scheduledAt: lessons.scheduledAt,
      durationMinutes: lessons.durationMinutes,
      status: lessons.status,
      meetingUrl: lessons.meetingUrl,
      notes: lessons.notes,
      courseName: courses.name,
      courseLevel: courses.level,
      teacherName: users.name,
    })
    .from(lessons)
    .innerJoin(courses, eq(lessons.courseId, courses.id))
    .innerJoin(teachers, eq(lessons.teacherId, teachers.id))
    .innerJoin(users, eq(teachers.userId, users.id))
    .where(and(...conditions))
    .orderBy(lessons.scheduledAt);
  return c.json({ items: rows });
});

lessonRoutes.post("/", zValidator("json", createLessonSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get("user").tenantId;

  const conflict = await findConflict(
    tenantId,
    body.teacherId,
    body.scheduledAt,
    body.durationMinutes
  );
  if (conflict) {
    return c.json(
      {
        error: "teacher_double_booked",
        conflictingLessonId: conflict.id,
        conflictingScheduledAt: conflict.scheduledAt.toISOString(),
      },
      409
    );
  }

  const [created] = await db
    .insert(lessons)
    .values({
      tenantId,
      courseId: body.courseId,
      teacherId: body.teacherId,
      scheduledAt: new Date(body.scheduledAt),
      durationMinutes: body.durationMinutes,
      meetingUrl: body.meetingUrl || null,
      notes: body.notes || null,
    })
    .returning();
  return c.json(created, 201);
});

lessonRoutes.patch("/:id", zValidator("json", updateLessonSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  const existing = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, id), eq(lessons.tenantId, tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  if (body.teacherId || body.scheduledAt || body.durationMinutes) {
    const teacherId = body.teacherId ?? existing.teacherId;
    const scheduledAt = body.scheduledAt ?? existing.scheduledAt.toISOString();
    const duration = body.durationMinutes ?? existing.durationMinutes;
    const conflict = await findConflict(tenantId, teacherId, scheduledAt, duration, id);
    if (conflict) {
      return c.json(
        {
          error: "teacher_double_booked",
          conflictingLessonId: conflict.id,
        },
        409
      );
    }
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.courseId !== undefined) patch.courseId = body.courseId;
  if (body.teacherId !== undefined) patch.teacherId = body.teacherId;
  if (body.scheduledAt !== undefined) patch.scheduledAt = new Date(body.scheduledAt);
  if (body.durationMinutes !== undefined) patch.durationMinutes = body.durationMinutes;
  if (body.meetingUrl !== undefined) patch.meetingUrl = body.meetingUrl || null;
  if (body.notes !== undefined) patch.notes = body.notes || null;

  const [updated] = await db
    .update(lessons)
    .set(patch)
    .where(and(eq(lessons.id, id), eq(lessons.tenantId, tenantId)))
    .returning();
  return c.json(updated);
});

lessonRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const [cancelled] = await db
    .update(lessons)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(lessons.id, id), eq(lessons.tenantId, tenantId)))
    .returning({ id: lessons.id });
  if (!cancelled) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true, id: cancelled.id });
});

// SCHED-503: Attendance routes

lessonRoutes.get("/:id/students", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  // Verify lesson belongs to tenant
  const lesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, id), eq(lessons.tenantId, tenantId)),
  });
  if (!lesson) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select({
      studentLessonId: studentLessons.id,
      studentId: studentLessons.studentId,
      attendanceStatus: studentLessons.attendanceStatus,
      markedBy: studentLessons.markedBy,
      markedAt: studentLessons.markedAt,
      fullName: students.fullName,
      email: students.email,
      phone: students.phone,
    })
    .from(studentLessons)
    .innerJoin(students, eq(studentLessons.studentId, students.id))
    .where(and(eq(studentLessons.lessonId, id), eq(studentLessons.tenantId, tenantId)))
    .orderBy(students.fullName);

  return c.json({ items: rows });
});

const attendanceBodySchema = z.object({
  attendanceStatus: z.enum(["present", "absent", "late", "excused"]),
});

const LOCK_HOURS = 24;

lessonRoutes.patch(
  "/:id/students/:studentId/attendance",
  zValidator("json", attendanceBodySchema),
  async (c) => {
    const lessonId = c.req.param("id");
    const studentId = c.req.param("studentId");
    const tenantId = c.get("user").tenantId;
    const user = c.get("user");
    const { attendanceStatus } = c.req.valid("json");

    // Verify lesson belongs to tenant
    const lesson = await db.query.lessons.findFirst({
      where: and(eq(lessons.id, lessonId), eq(lessons.tenantId, tenantId)),
    });
    if (!lesson) return c.json({ error: "not_found" }, 404);

    // Only allow marking when lesson has started (scheduledAt < now)
    const now = new Date();
    if (lesson.scheduledAt > now) {
      return c.json({ error: "lesson_not_started" }, 422);
    }

    // 24h lock: if lesson ended more than 24h ago AND markedBy is already set → only manager can edit
    const lockCutoff = new Date(now.getTime() - LOCK_HOURS * 60 * 60 * 1000);
    const isLocked = lesson.scheduledAt < lockCutoff;

    if (isLocked && user.role !== "admin") {
      return c.json({ error: "attendance_locked", message: "Prezența poate fi modificată doar de manager după 24h." }, 403);
    }

    // Upsert the student_lessons row
    const existing = await db.query.studentLessons.findFirst({
      where: and(
        eq(studentLessons.lessonId, lessonId),
        eq(studentLessons.studentId, studentId),
        eq(studentLessons.tenantId, tenantId),
      ),
    });

    if (existing) {
      const [updated] = await db
        .update(studentLessons)
        .set({
          attendanceStatus,
          markedBy: user.id,
          markedAt: now,
        })
        .where(eq(studentLessons.id, existing.id))
        .returning();
      return c.json(updated);
    } else {
      // Auto-enroll: create the student_lessons record if it doesn't exist
      const [created] = await db
        .insert(studentLessons)
        .values({
          tenantId,
          lessonId,
          studentId,
          attendanceStatus,
          markedBy: user.id,
          markedAt: now,
        })
        .returning();
      return c.json(created, 201);
    }
  }
);
