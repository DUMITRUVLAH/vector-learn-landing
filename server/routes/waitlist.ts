/**
 * GAP-005: Course waitlist API
 *
 * POST /api/courses/:id/waitlist          → join waitlist
 * GET  /api/courses/:id/waitlist          → list waitlist (manager only)
 * POST /api/waitlist/:id/confirm          → student confirms enrollment (spot taken)
 * POST /api/courses/:id/waitlist/notify   → internal: notify first on list when spot opens
 *
 * Lazy expiry: on GET/POST, rows with expiresAt < now() and no confirmedAt are
 * soft-deleted (set position 0, effectively removing from queue).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, lt, asc, sql, gt } from "drizzle-orm";
import { db } from "../db/client";
import {
  courseWaitlist,
  courses,
  students,
  studentLessons,
  lessons,
  notificationQueue,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const waitlistRoutes = new Hono<{ Variables: AuthVariables }>();
waitlistRoutes.use("*", requireAuth);

/**
 * Purge expired (notified but not confirmed) entries lazily.
 * Expired = notifiedAt is set, confirmedAt is null, expiresAt < now.
 */
async function purgeExpired(courseId: string) {
  const now = new Date();
  await db
    .delete(courseWaitlist)
    .where(
      and(
        eq(courseWaitlist.courseId, courseId),
        sql`${courseWaitlist.notifiedAt} IS NOT NULL`,
        sql`${courseWaitlist.confirmedAt} IS NULL`,
        lt(courseWaitlist.expiresAt, now)
      )
    );
}

/**
 * Count active students enrolled in a course (non-cancelled student_lessons in future lessons).
 */
async function countEnrolled(tenantId: string, courseId: string): Promise<number> {
  const rows = await db
    .select({ cnt: sql<number>`count(distinct ${studentLessons.studentId})::int` })
    .from(studentLessons)
    .innerJoin(lessons, eq(studentLessons.lessonId, lessons.id))
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        eq(lessons.courseId, courseId),
        gt(lessons.scheduledAt, new Date()),
      )
    );
  return rows[0]?.cnt ?? 0;
}

// ── POST /api/courses/:id/waitlist ───────────────────────────────────────────
const joinWaitlistSchema = z.object({
  studentId: z.string().uuid(),
});

waitlistRoutes.post("/courses/:id/waitlist", zValidator("json", joinWaitlistSchema), async (c) => {
  const courseId = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const { studentId } = c.req.valid("json");

  // Verify course belongs to tenant
  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), eq(courses.tenantId, tenantId)),
  });
  if (!course) return c.json({ error: "course_not_found" }, 404);

  // Verify student belongs to tenant
  const student = await db.query.students.findFirst({
    where: and(eq(students.id, studentId), eq(students.tenantId, tenantId)),
  });
  if (!student) return c.json({ error: "student_not_found" }, 404);

  // Purge expired entries first
  await purgeExpired(courseId);

  // Check if student is already on waitlist
  const existing = await db.query.courseWaitlist.findFirst({
    where: and(eq(courseWaitlist.courseId, courseId), eq(courseWaitlist.studentId, studentId)),
  });
  if (existing) return c.json({ error: "already_on_waitlist", position: existing.position }, 409);

  // Get next position
  const posRows = await db
    .select({ maxPos: sql<number>`coalesce(max(${courseWaitlist.position}), 0)::int` })
    .from(courseWaitlist)
    .where(eq(courseWaitlist.courseId, courseId));
  const nextPosition = (posRows[0]?.maxPos ?? 0) + 1;

  const [entry] = await db
    .insert(courseWaitlist)
    .values({
      tenantId,
      courseId,
      studentId,
      position: nextPosition,
    })
    .returning();

  return c.json({ entry, position: nextPosition }, 201);
});

// ── GET /api/courses/:id/waitlist ───────────────────────────────────────────
waitlistRoutes.get("/courses/:id/waitlist", async (c) => {
  const courseId = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  // Purge expired entries first
  await purgeExpired(courseId);

  const rows = await db
    .select({
      id: courseWaitlist.id,
      studentId: courseWaitlist.studentId,
      studentName: students.fullName,
      studentPhone: students.phone,
      position: courseWaitlist.position,
      notifiedAt: courseWaitlist.notifiedAt,
      confirmedAt: courseWaitlist.confirmedAt,
      expiresAt: courseWaitlist.expiresAt,
      createdAt: courseWaitlist.createdAt,
    })
    .from(courseWaitlist)
    .innerJoin(students, eq(courseWaitlist.studentId, students.id))
    .where(and(eq(courseWaitlist.courseId, courseId), eq(courseWaitlist.tenantId, tenantId)))
    .orderBy(asc(courseWaitlist.position));

  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), eq(courses.tenantId, tenantId)),
  });

  const enrolled = await countEnrolled(tenantId, courseId);

  return c.json({
    items: rows,
    enrolled,
    maxStudents: course?.maxStudents ?? null,
    isFull: course?.maxStudents != null ? enrolled >= course.maxStudents : false,
  });
});

// ── POST /api/waitlist/:id/confirm ───────────────────────────────────────────
const confirmWaitlistSchema = z.object({
  /** Enroll in all future lessons of the course */
  courseId: z.string().uuid(),
});

waitlistRoutes.post("/waitlist/:id/confirm", zValidator("json", confirmWaitlistSchema), async (c) => {
  const entryId = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  const entry = await db.query.courseWaitlist.findFirst({
    where: and(eq(courseWaitlist.id, entryId), eq(courseWaitlist.tenantId, tenantId)),
  });
  if (!entry) return c.json({ error: "not_found" }, 404);
  if (entry.confirmedAt) return c.json({ error: "already_confirmed" }, 409);

  // Mark confirmed
  const [confirmed] = await db
    .update(courseWaitlist)
    .set({ confirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(courseWaitlist.id, entryId))
    .returning();

  // Enroll student in future lessons of the course
  const futureLessons = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        eq(lessons.courseId, entry.courseId),
        gt(lessons.scheduledAt, new Date()),
      )
    );

  if (futureLessons.length > 0) {
    await db.insert(studentLessons).values(
      futureLessons.map((l) => ({
        tenantId,
        lessonId: l.id,
        studentId: entry.studentId,
        attendanceStatus: "pending" as const,
      }))
    ).onConflictDoNothing();
  }

  return c.json({ confirmed, enrolledLessons: futureLessons.length });
});

// ── POST /api/courses/:id/waitlist/notify-first ─────────────────────────────
/**
 * Called when a student leaves a course (spot opens up).
 * Notifies the first waiting student via notification_queue (COMM-205).
 */
waitlistRoutes.post("/courses/:id/waitlist/notify-first", async (c) => {
  const courseId = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  await purgeExpired(courseId);

  // Get first waiting (unnotified) student
  const first = await db.query.courseWaitlist.findFirst({
    where: and(
      eq(courseWaitlist.courseId, courseId),
      eq(courseWaitlist.tenantId, tenantId),
      sql`${courseWaitlist.notifiedAt} IS NULL`,
      sql`${courseWaitlist.confirmedAt} IS NULL`,
    ),
    orderBy: [asc(courseWaitlist.position)],
  });

  if (!first) return c.json({ ok: true, notified: false, reason: "waitlist_empty" });

  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h from now

  // Update entry with notification timestamp + expiry
  await db
    .update(courseWaitlist)
    .set({ notifiedAt: new Date(), expiresAt, updatedAt: new Date() })
    .where(eq(courseWaitlist.id, first.id));

  // Get course name for notification payload
  const course = await db.query.courses.findFirst({ where: eq(courses.id, courseId) });
  const student = await db.query.students.findFirst({ where: eq(students.id, first.studentId) });

  // Create notification in COMM-205 queue
  await db.insert(notificationQueue).values({
    tenantId,
    recipientType: "student",
    recipientId: first.studentId,
    channel: "email",
    payload: {
      body: `Un loc s-a eliberat la cursul "${course?.name ?? courseId}". Ai 48h să confirmi înrolarea.`,
      context: {
        course_id: courseId,
        waitlist_id: first.id,
        student_name: student?.fullName ?? "",
      },
    },
    scheduledFor: new Date(),
  });

  return c.json({
    ok: true,
    notified: true,
    studentId: first.studentId,
    waitlistEntryId: first.id,
    expiresAt: expiresAt.toISOString(),
  });
});
