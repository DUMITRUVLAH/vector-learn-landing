/**
 * SCHED-502: Recurring lessons API
 *
 * POST /api/lessons/recurring  — create a lesson series (N weekly occurrences)
 * DELETE /api/lessons/series/:seriesId/future?from=ISO_DATE — cancel future lessons in a series
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, ne } from "drizzle-orm";
import { db } from "../db/client";
import { lessons, lessonSeries, courses } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const recurringRoutes = new Hono<{ Variables: AuthVariables }>();

recurringRoutes.use("/*", requireAuth);

// ─── Shared conflict helpers (inline for this router) ─────────────────────────

import { sql } from "drizzle-orm";

async function findTeacherConflict(
  tenantId: string,
  teacherId: string,
  startISO: string,
  durationMinutes: number
): Promise<{ id: string } | null> {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const rows = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        eq(lessons.teacherId, teacherId),
        ne(lessons.status, "cancelled"),
        sql`${lessons.scheduledAt} < ${end.toISOString()}`,
        sql`(${lessons.scheduledAt} + (${lessons.durationMinutes} * interval '1 minute')) > ${start.toISOString()}`
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

async function findRoomConflict(
  tenantId: string,
  roomId: string,
  startISO: string,
  durationMinutes: number
): Promise<{ id: string } | null> {
  const start = new Date(startISO);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const rows = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        eq(lessons.roomId, roomId),
        ne(lessons.status, "cancelled"),
        sql`${lessons.scheduledAt} < ${end.toISOString()}`,
        sql`(${lessons.scheduledAt} + (${lessons.durationMinutes} * interval '1 minute')) > ${start.toISOString()}`
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

// ─── POST /api/lessons/recurring ─────────────────────────────────────────────

const recurringSchema = z.object({
  courseId: z.string().uuid(),
  teacherId: z.string().uuid(),
  /** ISO datetime of the FIRST occurrence */
  firstScheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  meetingUrl: z.string().url().max(500).optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
  roomId: z.string().uuid().optional().nullable(),
  recurrence: z.object({
    type: z.literal("weekly"),
    /** Number of occurrences (max 52 = 1 year) */
    count: z.number().int().min(1).max(52),
  }),
});

recurringRoutes.post("/recurring", zValidator("json", recurringSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const { courseId, teacherId, firstScheduledAt, durationMinutes, meetingUrl, notes, roomId, recurrence } = body;

  // Resolve course label for series label
  const [course] = await db.select({ name: courses.name }).from(courses).where(eq(courses.id, courseId));
  const firstDate = new Date(firstScheduledAt);
  const dayNames = ["Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"];
  const dayName = dayNames[firstDate.getDay()] ?? "?";
  const timeStr = firstDate.toTimeString().slice(0, 5);
  const label = course
    ? `${course.name} — ${dayName} ${timeStr}`
    : `Serie — ${dayName} ${timeStr}`;

  // Generate dates for all occurrences
  const dates: Date[] = [];
  for (let i = 0; i < recurrence.count; i++) {
    const d = new Date(firstDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    dates.push(d);
  }

  // Conflict-check all occurrences before inserting any
  const conflicts: Array<{ occurrence: number; scheduledAt: string; conflictId: string; type: string }> = [];
  for (let i = 0; i < dates.length; i++) {
    const scheduledAtISO = dates[i].toISOString();
    const teacherConflict = await findTeacherConflict(tenantId, teacherId, scheduledAtISO, durationMinutes);
    if (teacherConflict) {
      conflicts.push({ occurrence: i + 1, scheduledAt: scheduledAtISO, conflictId: teacherConflict.id, type: "teacher_double_booked" });
      continue;
    }
    if (roomId) {
      const roomConflict = await findRoomConflict(tenantId, roomId, scheduledAtISO, durationMinutes);
      if (roomConflict) {
        conflicts.push({ occurrence: i + 1, scheduledAt: scheduledAtISO, conflictId: roomConflict.id, type: "room_double_booked" });
      }
    }
  }

  // If any conflicts found → return 409 with details (none created)
  if (conflicts.length > 0) {
    return c.json({ error: "conflicts", conflicts }, 409);
  }

  // Create the series record
  const [series] = await db
    .insert(lessonSeries)
    .values({
      tenantId,
      label,
      recurrenceType: "weekly",
      dayOfWeek: ((firstDate.getDay() + 6) % 7) + 1, // ISO weekday: Mon=1…Sun=7
      occurrences: recurrence.count,
    })
    .returning();

  // Bulk-insert all lesson occurrences
  const rows = dates.map((d) => ({
    tenantId,
    courseId,
    teacherId,
    scheduledAt: d,
    durationMinutes,
    meetingUrl: meetingUrl || null,
    notes: notes || null,
    roomId: roomId ?? null,
    seriesId: series.id,
  }));

  const created = await db.insert(lessons).values(rows).returning();
  return c.json({ series, lessons: created }, 201);
});

// ─── DELETE /api/lessons/series/:seriesId/future ──────────────────────────────

const futureQuerySchema = z.object({
  from: z.string().datetime(),
});

recurringRoutes.delete(
  "/series/:seriesId/future",
  zValidator("query", futureQuerySchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const seriesId = c.req.param("seriesId");
    const { from } = c.req.valid("query");

    // Verify series belongs to tenant
    const [series] = await db
      .select({ id: lessonSeries.id })
      .from(lessonSeries)
      .where(and(eq(lessonSeries.id, seriesId), eq(lessonSeries.tenantId, tenantId)));
    if (!series) return c.json({ error: "not_found" }, 404);

    // Cancel all future (≥ from) scheduled lessons in this series
    const cancelled = await db
      .update(lessons)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(lessons.tenantId, tenantId),
          eq(lessons.seriesId, seriesId),
          ne(lessons.status, "cancelled"),
          gte(lessons.scheduledAt, new Date(from))
        )
      )
      .returning({ id: lessons.id });

    return c.json({ cancelledCount: cancelled.length, cancelledIds: cancelled.map((r) => r.id) });
  }
);
