/**
 * GAP-009: Recovery request endpoints
 *
 * Public (no auth):
 *   GET  /api/recovery/:token             — list suggested slots
 *   POST /api/recovery/:token/reserve     — reserve a slot
 *
 * Internal (auth required):
 *   GET  /api/recovery?studentId=&status= — list recovery requests for a student (staff view)
 */
import { Hono } from "hono";
import { and, eq, gte } from "drizzle-orm";
import { db } from "../db/client";
import { recoveryRequests, studentLessons, lessons, students, courses, teachers } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import crypto from "node:crypto";

export const recoveryRoutes = new Hono<{ Variables: AuthVariables }>();

// ─── PUBLIC: GET /api/recovery/:token ─────────────────────────────────────────
recoveryRoutes.get("/:token", async (c) => {
  const token = c.req.param("token");
  const now = new Date();

  const request = await db.query.recoveryRequests.findFirst({
    where: eq(recoveryRequests.token, token),
  });

  if (!request) return c.json({ error: "not_found" }, 404);
  if (request.expiresAt < now && request.status === "pending") {
    // Lazy expiration
    await db
      .update(recoveryRequests)
      .set({ status: "expired", updatedAt: now })
      .where(eq(recoveryRequests.id, request.id));
    return c.json({ error: "token_expired" }, 410);
  }
  if (request.status === "expired") return c.json({ error: "token_expired" }, 410);
  if (request.status === "reserved" || request.status === "completed") {
    return c.json({ status: request.status, reservedLessonId: request.reservedLessonId });
  }

  return c.json({
    id: request.id,
    status: request.status,
    suggestedSlots: request.suggestedSlots,
    expiresAt: request.expiresAt,
  });
});

// ─── PUBLIC: POST /api/recovery/:token/reserve ────────────────────────────────
recoveryRoutes.post("/:token/reserve", async (c) => {
  const token = c.req.param("token");
  const body = await c.req.json().catch(() => null);
  const lessonId: string | undefined = body?.lessonId;

  if (!lessonId) return c.json({ error: "lessonId_required" }, 400);

  const now = new Date();
  const request = await db.query.recoveryRequests.findFirst({
    where: eq(recoveryRequests.token, token),
  });

  if (!request) return c.json({ error: "not_found" }, 404);
  if (request.expiresAt < now || request.status === "expired") {
    return c.json({ error: "token_expired" }, 410);
  }
  if (request.status !== "pending") {
    return c.json({ error: "already_resolved", status: request.status }, 409);
  }

  // Verify the chosen lessonId is in the suggested slots
  const slots = request.suggestedSlots ?? [];
  const chosenSlot = slots.find((s) => s.lessonId === lessonId);
  if (!chosenSlot) return c.json({ error: "invalid_lesson" }, 422);

  // Get the original student_lesson to find the studentId
  const origSl = await db.query.studentLessons.findFirst({
    where: eq(studentLessons.id, request.studentLessonId),
  });
  if (!origSl) return c.json({ error: "original_lesson_not_found" }, 404);

  // Upsert student_lessons for the recovery lesson
  const existingSl = await db.query.studentLessons.findFirst({
    where: and(
      eq(studentLessons.lessonId, lessonId),
      eq(studentLessons.studentId, origSl.studentId),
      eq(studentLessons.tenantId, request.tenantId)
    ),
  });

  if (!existingSl) {
    await db.insert(studentLessons).values({
      tenantId: request.tenantId,
      lessonId,
      studentId: origSl.studentId,
      attendanceStatus: "pending",
    });
  }

  // Mark recovery reserved
  await db
    .update(recoveryRequests)
    .set({ status: "reserved", reservedLessonId: lessonId, updatedAt: now })
    .where(eq(recoveryRequests.id, request.id));

  return c.json({ ok: true, reservedLessonId: lessonId });
});

// ─── INTERNAL: GET /api/recovery (staff view, auth required) ──────────────────
const internalRecoveryRoutes = new Hono<{ Variables: AuthVariables }>();
internalRecoveryRoutes.use("*", requireAuth);

internalRecoveryRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const { studentId, status } = c.req.query();

  const conditions = [eq(recoveryRequests.tenantId, tenantId)];
  if (status) {
    conditions.push(eq(recoveryRequests.status, status as "pending" | "reserved" | "expired" | "completed"));
  }

  let items = await db
    .select()
    .from(recoveryRequests)
    .where(and(...conditions));

  // If studentId filter requested, filter via studentLessons join (post-query for simplicity)
  if (studentId) {
    const sl = await db
      .select({ id: studentLessons.id })
      .from(studentLessons)
      .where(and(eq(studentLessons.studentId, studentId), eq(studentLessons.tenantId, tenantId)));
    const slIds = new Set(sl.map((s) => s.id));
    items = items.filter((r) => slIds.has(r.studentLessonId));
  }

  return c.json({ items });
});

export { internalRecoveryRoutes };

// ─── Helper: generate recovery token ─────────────────────────────────────────
export function generateRecoveryToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * GAP-009: Called from the attendance PATCH hook when status = 'absent'.
 * Finds up to 3 available slots with the same teacher+course in the next 14 days
 * and creates a recovery_request with those slots.
 *
 * Runs fire-and-forget (void) so it never blocks the attendance response.
 */
export async function createRecoveryRequestIfAbsent(opts: {
  tenantId: string;
  studentLessonId: string;
  lessonId: string;
  studentId: string;
}): Promise<void> {
  const { tenantId, studentLessonId, lessonId } = opts;

  // Idempotent: don't create twice for same student_lesson
  const existing = await db.query.recoveryRequests.findFirst({
    where: eq(recoveryRequests.studentLessonId, studentLessonId),
  });
  if (existing) return;

  // Get the original lesson to know course + teacher
  const originalLesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), eq(lessons.tenantId, tenantId)),
    with: {
      // drizzle relations not set up here — use separate queries
    },
  });
  if (!originalLesson) return;

  // Get teacher name
  const teacher = await db.query.teachers.findFirst({
    where: eq(teachers.id, originalLesson.teacherId),
  });
  // Get course name
  const course = await db.query.courses.findFirst({
    where: eq(courses.id, originalLesson.courseId),
  });

  // Find future lessons (next 14 days) with same teacher, same course, not a trial
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const candidates = await db
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        eq(lessons.teacherId, originalLesson.teacherId),
        eq(lessons.courseId, originalLesson.courseId),
        eq(lessons.isTrial, false),
        gte(lessons.scheduledAt, now)
      )
    );

  // Filter to within 14 days and exclude the original lesson
  const slots = candidates
    .filter((l) => l.id !== lessonId && l.scheduledAt <= horizon)
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
    .slice(0, 3)
    .map((l) => ({
      lessonId: l.id,
      scheduledAt: l.scheduledAt.toISOString(),
      teacherName: teacher?.fullName ?? "—",
      courseName: course?.name ?? "—",
    }));

  const token = generateRecoveryToken();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  await db.insert(recoveryRequests).values({
    tenantId,
    studentLessonId,
    suggestedSlots: slots,
    token,
    expiresAt,
    status: "pending",
  });
}
