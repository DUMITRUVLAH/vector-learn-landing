/**
 * GAP-010: Student/Parent self-service portal
 *
 * PUBLIC routes (no admin auth required — token-based access):
 *   GET  /api/portal/:token  — student data: upcoming lessons, balance, active packages
 *
 * ADMIN routes (requireAuth):
 *   POST /api/portal/token   — generate or refresh a portal token for a student
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  studentPortalTokens,
  students,
  lessons,
  studentLessons,
  teachers,
  users,
  courses,
  rooms,
  payments,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = result as { rows?: T[] };
  return r.rows ?? [];
}

// ─── Public router (no auth) ────────────────────────────────────────────────
export const portalRoutes = new Hono();

/** GET /api/portal/:token — returns student portal data */
portalRoutes.get("/:token", async (c) => {
  const token = c.req.param("token");
  if (!UUID_REGEX.test(token)) return c.json({ error: "invalid_token" }, 401);

  const now = new Date();

  // Find valid, active, non-expired token
  const tokenRows = normalizeRows<typeof studentPortalTokens.$inferSelect>(
    await db
      .select()
      .from(studentPortalTokens)
      .where(
        and(
          eq(studentPortalTokens.token, token),
          eq(studentPortalTokens.isActive, true),
          gte(studentPortalTokens.expiresAt, now)
        )
      )
      .limit(1)
  );

  const tokenRecord = tokenRows[0];
  if (!tokenRecord) return c.json({ error: "invalid_or_expired_token" }, 401);

  // Update lastUsedAt
  await db
    .update(studentPortalTokens)
    .set({ lastUsedAt: now })
    .where(eq(studentPortalTokens.id, tokenRecord.id));

  const studentId = tokenRecord.studentId;
  const tenantId = tokenRecord.tenantId;

  // Fetch student
  const studentRows = normalizeRows<typeof students.$inferSelect>(
    await db
      .select()
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
      .limit(1)
  );
  const student = studentRows[0];
  if (!student) return c.json({ error: "student_not_found" }, 404);

  // Upcoming lessons (next 7 days) — via student_lessons join
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const upcomingRows = normalizeRows<{
    id: string;
    scheduledAt: Date;
    durationMinutes: number;
    teacherName: string | null;
    courseName: string | null;
    roomName: string | null;
    meetingUrl: string | null;
    status: string;
  }>(
    await db
      .select({
        id: lessons.id,
        scheduledAt: lessons.scheduledAt,
        durationMinutes: lessons.durationMinutes,
        teacherName: users.name,
        courseName: courses.name,
        roomName: rooms.name,
        meetingUrl: lessons.meetingUrl,
        status: lessons.status,
      })
      .from(studentLessons)
      .innerJoin(lessons, eq(lessons.id, studentLessons.lessonId))
      .leftJoin(teachers, eq(teachers.id, lessons.teacherId))
      .leftJoin(users, eq(users.id, teachers.userId))
      .leftJoin(courses, eq(courses.id, lessons.courseId))
      .leftJoin(rooms, eq(rooms.id, lessons.roomId))
      .where(
        and(
          eq(studentLessons.studentId, studentId),
          eq(studentLessons.tenantId, tenantId),
          gte(lessons.scheduledAt, now),
          ne(lessons.status, "cancelled"),
          sql`${lessons.scheduledAt} <= ${weekAhead.toISOString()}::timestamptz`
        )
      )
      .orderBy(lessons.scheduledAt)
      .limit(20)
  );

  // Recent payments (last 5)
  const paymentRows = normalizeRows<typeof payments.$inferSelect>(
    await db
      .select()
      .from(payments)
      .where(and(eq(payments.studentId, studentId), eq(payments.tenantId, tenantId)))
      .orderBy(desc(payments.createdAt))
      .limit(5)
  );

  return c.json({
    student: {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
      phone: student.phone,
      status: student.status,
      debtCents: student.debtCents,
    },
    upcomingLessons: upcomingRows.map((l) => ({
      id: l.id,
      scheduledAt: l.scheduledAt,
      durationMinutes: l.durationMinutes,
      teacher: l.teacherName,
      course: l.courseName,
      room: l.roomName,
      meetingUrl: l.meetingUrl,
      status: l.status,
    })),
    recentPayments: paymentRows.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      currency: p.currency,
      status: p.status,
      paidAt: p.paidAt,
      description: p.description,
    })),
    activePackage: null, // GAP-005/006 lessonPackages not on this branch yet — placeholder
  });
});

// ─── Admin router (requireAuth) ──────────────────────────────────────────────
export const portalAdminRoutes = new Hono<{ Variables: AuthVariables }>();

portalAdminRoutes.use("*", requireAuth);

const generateTokenSchema = z.object({
  studentId: z.string().uuid(),
  /** Days until expiry, default 30 */
  expiryDays: z.number().int().min(1).max(365).default(30),
});

/** POST /api/portal/token — generate or refresh a portal token for a student */
portalAdminRoutes.post("/token", zValidator("json", generateTokenSchema), async (c) => {
  const { studentId, expiryDays } = c.req.valid("json");
  const { tenantId } = c.get("user");

  // Verify student belongs to tenant
  const studentRows = normalizeRows<typeof students.$inferSelect>(
    await db
      .select()
      .from(students)
      .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
      .limit(1)
  );
  const student = studentRows[0];
  if (!student) return c.json({ error: "student_not_found" }, 404);

  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  // Deactivate any existing active tokens for this student
  await db
    .update(studentPortalTokens)
    .set({ isActive: false })
    .where(
      and(eq(studentPortalTokens.studentId, studentId), eq(studentPortalTokens.isActive, true))
    );

  // Create new token
  const newTokenRows = normalizeRows<typeof studentPortalTokens.$inferSelect>(
    await db
      .insert(studentPortalTokens)
      .values({
        tenantId,
        studentId,
        expiresAt,
      })
      .returning()
  );

  const newToken = newTokenRows[0];
  if (!newToken) return c.json({ error: "failed_to_create_token" }, 500);

  const portalUrl = `#/portal/${newToken.token}`;

  return c.json({
    token: newToken.token,
    expiresAt: newToken.expiresAt,
    portalUrl,
    studentName: student.fullName,
  });
});
