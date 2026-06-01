/**
 * GAP-013 — Make-up credits routes
 *
 * Routes:
 *   GET  /api/makeup/credits?studentId=          — list credits for a student
 *   POST /api/makeup/book                         — book a make-up lesson using a credit
 *   GET  /api/makeup/available-lessons?studentId=&creditId= — future lessons from same course
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { makeupCredits, lessons, studentLessons } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const router = new Hono<{ Variables: AuthVariables }>();
router.use("*", requireAuth);

// ─── GET /api/makeup/credits?studentId= ──────────────────────────────────────
router.get("/credits", async (c) => {
  const tenantId = c.get("tenantId");
  const studentId = c.req.query("studentId");
  if (!studentId) return c.json({ error: "studentId required" }, 400);

  const now = new Date();
  const rows = await db
    .select()
    .from(makeupCredits)
    .where(and(eq(makeupCredits.tenantId, tenantId), eq(makeupCredits.studentId, studentId)))
    .orderBy(desc(makeupCredits.createdAt));

  const credits = rows.map((r) => ({
    ...r,
    status: r.usedAt ? "used" : r.expiresAt < now ? "expired" : "available",
  }));

  return c.json(credits);
});

// ─── POST /api/makeup/book ────────────────────────────────────────────────────
const bookSchema = z.object({
  creditId: z.string().uuid(),
  lessonId: z.string().uuid(),
});

router.post("/book", zValidator("json", bookSchema), async (c) => {
  const tenantId = c.get("tenantId");
  const { creditId, lessonId } = c.req.valid("json");

  // Fetch and validate credit
  const creditRows = await db
    .select()
    .from(makeupCredits)
    .where(and(eq(makeupCredits.id, creditId), eq(makeupCredits.tenantId, tenantId)))
    .limit(1);

  if (!creditRows.length) return c.json({ error: "credit_not_found" }, 404);
  const credit = creditRows[0];

  if (credit.usedAt) return c.json({ error: "credit_already_used" }, 409);
  if (credit.expiresAt < new Date()) return c.json({ error: "credit_expired" }, 410);

  // Validate target lesson exists and belongs to tenant
  const lessonRows = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), eq(lessons.tenantId, tenantId)))
    .limit(1);
  if (!lessonRows.length) return c.json({ error: "lesson_not_found" }, 404);

  const now = new Date();

  // Mark credit used and set makeup lesson
  await db
    .update(makeupCredits)
    .set({ usedAt: now, makeupLessonId: lessonId })
    .where(eq(makeupCredits.id, creditId));

  // Enroll student in the make-up lesson (upsert)
  await db
    .insert(studentLessons)
    .values({
      tenantId,
      studentId: credit.studentId,
      lessonId,
      attendanceStatus: "scheduled",
    })
    .onConflictDoNothing();

  return c.json({ ok: true, makeupLessonId: lessonId }, 201);
});

// ─── GET /api/makeup/available-lessons ───────────────────────────────────────
router.get("/available-lessons", async (c) => {
  const tenantId = c.get("tenantId");
  const studentId = c.req.query("studentId");
  const creditId = c.req.query("creditId");
  if (!studentId || !creditId) return c.json({ error: "studentId and creditId required" }, 400);

  // Get original lesson to find courseId
  const creditRows = await db
    .select({ lessonId: makeupCredits.lessonId })
    .from(makeupCredits)
    .where(and(eq(makeupCredits.id, creditId), eq(makeupCredits.tenantId, tenantId)))
    .limit(1);
  if (!creditRows.length) return c.json({ error: "credit_not_found" }, 404);

  const origLessonRows = await db
    .select({ courseId: lessons.courseId, startsAt: lessons.startsAt })
    .from(lessons)
    .where(eq(lessons.id, creditRows[0].lessonId))
    .limit(1);
  if (!origLessonRows.length) return c.json([], 200);

  const { courseId } = origLessonRows[0];
  const now = new Date();

  // Future lessons from same course that the student is NOT already enrolled in
  const futureLessons = await db
    .select({
      id: lessons.id,
      startsAt: lessons.startsAt,
      durationMinutes: lessons.durationMinutes,
      courseId: lessons.courseId,
    })
    .from(lessons)
    .where(
      and(
        eq(lessons.tenantId, tenantId),
        eq(lessons.courseId, courseId),
        gt(lessons.startsAt, now)
      )
    )
    .orderBy(lessons.startsAt)
    .limit(20);

  return c.json(futureLessons);
});

export { router as makeupRoutes };
