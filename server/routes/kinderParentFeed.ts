/**
 * KINDER-005 — Parent app feed + messaging
 *
 * GET  /api/kinder/parent-feed/:studentId?date=YYYY-MM-DD — aggregated feed for a day
 * GET  /api/kinder/messages/:studentId                     — list all messages for student
 * POST /api/kinder/messages/:studentId                     — send a message
 * PATCH /api/kinder/messages/:studentId/:messageId/read    — mark as read
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import {
  students,
  checkinLog,
  dailyReportEvents,
  kinderMessages,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const kinderParentFeedRoutes = new Hono<{ Variables: AuthVariables }>();

kinderParentFeedRoutes.use("*", requireAuth);

/** UTC today as YYYY-MM-DD */
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── GET /api/kinder/parent-feed/:studentId ───────────────────────────────────
// Aggregates check-in/out, diary events, and messages for a given day, sorted
// chronologically.
kinderParentFeedRoutes.get("/parent-feed/:studentId", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("studentId");
  const date = c.req.query("date") ?? todayDate();

  // Validate student belongs to tenant
  const [student] = await db
    .select({ id: students.id, fullName: students.fullName })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));

  if (!student) {
    return c.json({ error: "Student not found" }, 404);
  }

  // Fetch all sources in parallel
  const [checkinRows, diaryRows, messageRows] = await Promise.all([
    db
      .select()
      .from(checkinLog)
      .where(
        and(
          eq(checkinLog.studentId, studentId),
          eq(checkinLog.tenantId, user.tenantId),
          eq(checkinLog.logDate, date)
        )
      ),
    db
      .select()
      .from(dailyReportEvents)
      .where(
        and(
          eq(dailyReportEvents.studentId, studentId),
          eq(dailyReportEvents.tenantId, user.tenantId),
          eq(dailyReportEvents.eventDate, date)
        )
      ),
    db
      .select()
      .from(kinderMessages)
      .where(
        and(
          eq(kinderMessages.studentId, studentId),
          eq(kinderMessages.tenantId, user.tenantId)
        )
      )
      .orderBy(desc(kinderMessages.sentAt)),
  ]);

  // Build unified feed items
  const feedItems: Array<{
    type: string;
    timestamp: string;
    data: Record<string, unknown>;
  }> = [];

  // Check-in entry
  for (const log of checkinRows) {
    if (log.checkedInAt) {
      feedItems.push({
        type: "checkin",
        timestamp: log.checkedInAt.toISOString(),
        data: {
          id: log.id,
          staffUserId: log.staffUserId,
          notes: log.notes,
        },
      });
    }
    if (log.checkedOutAt) {
      feedItems.push({
        type: "checkout",
        timestamp: log.checkedOutAt.toISOString(),
        data: {
          id: log.id,
          pickupPersonName: log.pickupPersonName,
          hasSignature: !!log.signatureDataUrl,
        },
      });
    }
  }

  // Diary events
  for (const event of diaryRows) {
    feedItems.push({
      type: "diary",
      timestamp: event.createdAt.toISOString(),
      data: {
        id: event.id,
        eventType: event.eventType,
        details: event.details,
        photoUrl: event.photoUrl,
      },
    });
  }

  // Messages for this day (filter by date prefix)
  const dayMessages = messageRows.filter(
    (m) => m.sentAt.toISOString().slice(0, 10) === date
  );
  for (const msg of dayMessages) {
    feedItems.push({
      type: "message",
      timestamp: msg.sentAt.toISOString(),
      data: {
        id: msg.id,
        direction: msg.direction,
        body: msg.body,
        readAt: msg.readAt?.toISOString() ?? null,
      },
    });
  }

  // Sort chronologically
  feedItems.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return c.json({
    date,
    studentId,
    fullName: student.fullName,
    items: feedItems,
    totalMessages: messageRows.length,
  });
});

// ─── GET /api/kinder/messages/:studentId ──────────────────────────────────────
kinderParentFeedRoutes.get("/messages/:studentId", async (c) => {
  const user = c.get("user");
  const studentId = c.req.param("studentId");

  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.tenantId, user.tenantId)));

  if (!student) {
    return c.json({ error: "Student not found" }, 404);
  }

  const messages = await db
    .select()
    .from(kinderMessages)
    .where(
      and(
        eq(kinderMessages.studentId, studentId),
        eq(kinderMessages.tenantId, user.tenantId)
      )
    )
    .orderBy(desc(kinderMessages.sentAt));

  return c.json(messages);
});

// ─── POST /api/kinder/messages/:studentId ─────────────────────────────────────
const sendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
  direction: z.enum(["staff_to_parent", "parent_to_staff"]),
});

kinderParentFeedRoutes.post(
  "/messages/:studentId",
  zValidator("json", sendMessageSchema),
  async (c) => {
    const user = c.get("user");
    const studentId = c.req.param("studentId");
    const body = c.req.valid("json");

    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(
        and(eq(students.id, studentId), eq(students.tenantId, user.tenantId))
      );

    if (!student) {
      return c.json({ error: "Student not found" }, 404);
    }

    const [message] = await db
      .insert(kinderMessages)
      .values({
        tenantId: user.tenantId,
        studentId,
        senderUserId: user.id,
        direction: body.direction,
        body: body.body,
        sentAt: new Date(),
      })
      .returning();

    return c.json(message, 201);
  }
);

// ─── PATCH /api/kinder/messages/:studentId/:messageId/read ───────────────────
kinderParentFeedRoutes.patch(
  "/messages/:studentId/:messageId/read",
  async (c) => {
    const user = c.get("user");
    const { studentId, messageId } = c.req.param();

    const [updated] = await db
      .update(kinderMessages)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(kinderMessages.id, messageId),
          eq(kinderMessages.studentId, studentId),
          eq(kinderMessages.tenantId, user.tenantId)
        )
      )
      .returning({ id: kinderMessages.id, readAt: kinderMessages.readAt });

    if (!updated) {
      return c.json({ error: "Message not found" }, 404);
    }

    return c.json({ ok: true, readAt: updated.readAt?.toISOString() });
  }
);
