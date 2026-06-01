/**
 * KINDER-002 — Daily report / child diary API
 *
 * GET  /api/kinder/diary/:studentId?date=YYYY-MM-DD  — get events for a student on a date
 * POST /api/kinder/diary                             — add an event for today
 * DELETE /api/kinder/diary/:eventId                 — remove an event
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { students, dailyReportEvents } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const kinderDiaryRoutes = new Hono<{ Variables: AuthVariables }>();

kinderDiaryRoutes.use("*", requireAuth);

/** Today's date as YYYY-MM-DD (UTC) */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── GET /api/kinder/diary/:studentId ─────────────────────────────────────────
kinderDiaryRoutes.get("/diary/:studentId", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("studentId");
  const date = c.req.query("date") ?? todayDate();

  // Verify student belongs to tenant
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));
  if (!student) return c.json({ error: "student_not_found" }, 404);

  const events = await db
    .select()
    .from(dailyReportEvents)
    .where(
      and(
        eq(dailyReportEvents.studentId, studentId),
        eq(dailyReportEvents.eventDate, date)
      )
    )
    .orderBy(desc(dailyReportEvents.createdAt));

  return c.json({ date, studentId, events });
});

// ─── POST /api/kinder/diary ────────────────────────────────────────────────────
const diaryEventSchema = z.object({
  studentId: z.string().uuid(),
  eventType: z.enum(["meal", "nap", "diaper", "activity", "photo", "note"]),
  details: z.record(z.unknown()).optional(),
  photoUrl: z.string().url().max(1000).optional(),
});

kinderDiaryRoutes.post("/diary", zValidator("json", diaryEventSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Verify student belongs to tenant
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, body.studentId), eq(students.tenantId, user.tenantId)));
  if (!student) return c.json({ error: "student_not_found" }, 404);

  const [created] = await db
    .insert(dailyReportEvents)
    .values({
      tenantId: user.tenantId,
      studentId: body.studentId,
      eventDate: todayDate(),
      eventType: body.eventType,
      details: body.details ?? null,
      photoUrl: body.photoUrl ?? null,
      staffUserId: user.id,
    })
    .returning();

  return c.json({ ok: true, event: created }, 201);
});

// ─── DELETE /api/kinder/diary/:eventId ─────────────────────────────────────────
kinderDiaryRoutes.delete("/diary/:eventId", async (c) => {
  const user = c.get("user");
  const eventId = c.req.param("eventId");

  // Verify event belongs to this tenant
  const [event] = await db
    .select({ id: dailyReportEvents.id })
    .from(dailyReportEvents)
    .where(
      and(
        eq(dailyReportEvents.id, eventId),
        eq(dailyReportEvents.tenantId, user.tenantId)
      )
    );
  if (!event) return c.json({ error: "not_found" }, 404);

  await db.delete(dailyReportEvents).where(eq(dailyReportEvents.id, eventId));
  return c.json({ ok: true });
});
