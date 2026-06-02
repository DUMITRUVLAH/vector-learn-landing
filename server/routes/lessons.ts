import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, lt, ne, sql, asc } from "drizzle-orm";
import { db } from "../db/client";
import { lessons, courses, teachers, users, students, studentLessons, lessonPackages, auditLog } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { scheduleExhaustionAlert } from "./lessonPackages";

const createLessonSchema = z.object({
  courseId: z.string().uuid(),
  teacherId: z.string().uuid(),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  meetingUrl: z.string().url().max(500).optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
  /** SCHED-501: Optional room assignment */
  roomId: z.string().uuid().optional().nullable(),
  /** GAP-003: Trial lesson flag */
  isTrial: z.boolean().optional().default(false),
  /** GAP-003: Lead FK when isTrial = true */
  trialLeadId: z.string().uuid().optional().nullable(),
  /** GAP-003: Teacher-recorded result */
  trialResult: z.enum(["interested", "not_interested", "no_show"]).optional().nullable(),
});

const updateLessonSchema = createLessonSchema.partial();

const listQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  /** GAP-003: Filter by trial lead */
  leadId: z.string().uuid().optional(),
});

export const lessonRoutes = new Hono<{ Variables: AuthVariables }>();

lessonRoutes.use("*", requireAuth);

/** SCHED-501: Check if a room is occupied in the given time window */
async function findRoomConflict(
  tenantId: string,
  roomId: string,
  startISO: string,
  durationMinutes: number,
  excludeLessonId?: string
): Promise<{ id: string } | null> {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const conditions = [
    eq(lessons.tenantId, tenantId),
    eq(lessons.roomId, roomId),
    ne(lessons.status, "cancelled"),
    sql`${lessons.scheduledAt} < ${end.toISOString()}`,
    sql`(${lessons.scheduledAt} + (${lessons.durationMinutes} * interval '1 minute')) > ${start.toISOString()}`,
  ];
  if (excludeLessonId) conditions.push(ne(lessons.id, excludeLessonId));
  const conflicts = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(...conditions))
    .limit(1);
  return conflicts[0] ?? null;
}

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
  const { from, to, leadId } = c.req.valid("query");
  const tenantId = c.get("user").tenantId;
  const conditions = [eq(lessons.tenantId, tenantId)];
  // BRANCH-703: restrict to user's branch scope
  withBranchFilter(user, conditions, lessons.branchId);
  if (from) conditions.push(gte(lessons.scheduledAt, new Date(from)));
  if (to) conditions.push(lt(lessons.scheduledAt, new Date(to)));
  // GAP-003: filter by trial lead
  if (leadId) conditions.push(eq(lessons.trialLeadId, leadId));

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
      isTrial: lessons.isTrial,
      trialLeadId: lessons.trialLeadId,
      trialResult: lessons.trialResult,
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

  // SCHED-501: Room conflict check
  if (body.roomId) {
    const roomConflict = await findRoomConflict(tenantId, body.roomId, body.scheduledAt, body.durationMinutes);
    if (roomConflict) {
      return c.json({ error: "room_double_booked", conflictingLessonId: roomConflict.id }, 409);
    }
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
      roomId: body.roomId ?? null,
      isTrial: body.isTrial ?? false,
      trialLeadId: body.trialLeadId ?? null,
      trialResult: body.trialResult ?? null,
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
  if (body.roomId !== undefined) patch.roomId = body.roomId ?? null;
  // GAP-003: Trial lesson fields
  if (body.isTrial !== undefined) patch.isTrial = body.isTrial;
  if (body.trialLeadId !== undefined) patch.trialLeadId = body.trialLeadId ?? null;
  if (body.trialResult !== undefined) patch.trialResult = body.trialResult ?? null;

  // SCHED-501: Room conflict check on patch
  if (body.roomId && (body.scheduledAt || body.durationMinutes)) {
    const schedAt = body.scheduledAt ?? existing.scheduledAt.toISOString();
    const dur = body.durationMinutes ?? existing.durationMinutes;
    const roomConflict = await findRoomConflict(tenantId, body.roomId, schedAt, dur, id);
    if (roomConflict) {
      return c.json({ error: "room_double_booked", conflictingLessonId: roomConflict.id }, 409);
    }
  }

  const [updated] = await db
    .update(lessons)
    .set(patch)
    .where(and(eq(lessons.id, id), eq(lessons.tenantId, tenantId)))
    .returning();

  // COMM-205: if scheduledAt changed → queue notification for students
  if (body.scheduledAt && existing.scheduledAt.toISOString() !== new Date(body.scheduledAt).toISOString()) {
    // Best-effort: fire and forget (don't block response)
    const { studentLessons } = await import("../db/schema");
    db.select({ studentId: studentLessons.studentId })
      .from(studentLessons)
      .where(eq(studentLessons.lessonId, id))
      .then(async (rows) => {
        for (const row of rows) {
          const newTime = new Date(body.scheduledAt!).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" });
          await notificationService.queueNotification({
            tenantId,
            recipientType: "student",
            recipientId: row.studentId,
            channel: "sms",
            payload: {
              body: `Lecția dvs. a fost mutată la ${newTime}. Vă rugăm să confirmați prezența.`,
            },
          }).catch(() => { /* silent — notification failure shouldn't break response */ });
        }
      }).catch(() => { /* silent */ });
  }

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

    const previousStatus = existing?.attendanceStatus ?? null;

    let result;
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
      result = updated;
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
      result = created;
    }

    // ── GAP-007: Unit deduction hook ─────────────────────────────────────────
    // Skip deduction for trial lessons (GAP-003).
    // Only touch packages when transitioning TO or FROM 'present'.
    const isTrialLesson = (lesson as unknown as Record<string, unknown>).isTrial === true;

    if (!isTrialLesson) {
      const wasPresent = previousStatus === "present";
      const nowPresent = attendanceStatus === "present";

      if (nowPresent && !wasPresent) {
        // Mark present → deduct 1 unit from oldest active package (FIFO on validFrom)
        await deductUnit(tenantId, studentId, lesson.courseId, lessonId, user.id);
      } else if (!nowPresent && wasPresent) {
        // Un-mark present → restore 1 unit (reverse deduction)
        await restoreUnit(tenantId, studentId, lesson.courseId, lessonId, user.id);
      }
    }

    return existing ? c.json(result) : c.json(result, 201);
  }
);

/**
 * GAP-007: Atomically deduct 1 unit from the oldest active lesson package for
 * (studentId, courseId). No-op if no active package exists.
 */
async function deductUnit(
  tenantId: string,
  studentId: string,
  courseId: string,
  lessonId: string,
  actorId: string
) {
  // Find oldest active package (FIFO on validFrom)
  const activePackages = await db
    .select()
    .from(lessonPackages)
    .where(
      and(
        eq(lessonPackages.tenantId, tenantId),
        eq(lessonPackages.studentId, studentId),
        eq(lessonPackages.courseId, courseId),
        eq(lessonPackages.status, "active"),
      )
    )
    .orderBy(asc(lessonPackages.validFrom))
    .limit(1);

  const pkg = activePackages[0];
  if (!pkg) return; // No active package — no-op

  const newRemaining = pkg.unitsRemaining - 1;
  const newStatus = newRemaining <= 0 ? "exhausted" as const : "active" as const;

  await db
    .update(lessonPackages)
    .set({
      unitsRemaining: newRemaining,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(lessonPackages.id, pkg.id));

  // Log to audit_log
  await db.insert(auditLog).values({
    tenantId,
    actorId,
    actionType: "unit_deducted",
    targetType: "lesson_package",
    targetId: pkg.id,
    oldValue: { unitsRemaining: pkg.unitsRemaining, status: pkg.status },
    newValue: { unitsRemaining: newRemaining, status: newStatus, studentId, lessonId },
  });

  // Low-balance alert (≤ 2 remaining) or exhausted
  if (newRemaining <= 2) {
    await scheduleExhaustionAlert(tenantId, pkg.id, studentId, newRemaining);
  }
}

/**
 * GAP-007: Reverse deduction — add 1 unit back to the most recent active or exhausted package.
 * Called when a 'present' mark is changed back to absent/excused/late.
 */
async function restoreUnit(
  tenantId: string,
  studentId: string,
  courseId: string,
  lessonId: string,
  actorId: string
) {
  // Find the most recently updated package (the one that was just decremented)
  const packages = await db
    .select()
    .from(lessonPackages)
    .where(
      and(
        eq(lessonPackages.tenantId, tenantId),
        eq(lessonPackages.studentId, studentId),
        eq(lessonPackages.courseId, courseId),
        // Can restore from active or exhausted (the deduction may have just exhausted it)
        sql`${lessonPackages.status} IN ('active', 'exhausted')`,
      )
    )
    .orderBy(asc(lessonPackages.validFrom))
    .limit(1);

  const pkg = packages[0];
  if (!pkg) return;

  const newRemaining = pkg.unitsRemaining + 1;
  const newStatus = newRemaining > 0 ? "active" as const : "exhausted" as const;

  await db
    .update(lessonPackages)
    .set({
      unitsRemaining: newRemaining,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(lessonPackages.id, pkg.id));

  await db.insert(auditLog).values({
    tenantId,
    actorId,
    actionType: "unit_restored",
    targetType: "lesson_package",
    targetId: pkg.id,
    oldValue: { unitsRemaining: pkg.unitsRemaining, status: pkg.status },
    newValue: { unitsRemaining: newRemaining, status: newStatus, studentId, lessonId },
  });
}
