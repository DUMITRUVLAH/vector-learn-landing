/**
 * GAP-017: Portal notification preferences + cron endpoints for proactive alerts
 *
 * PUBLIC routes (token-based, accessible via portal token):
 *   GET   /api/portal/:token/prefs         — get notification preferences
 *   PATCH /api/portal/:token/prefs         — student opt-out / update prefs
 *
 * ADMIN routes (requireAuth):
 *   PATCH /api/portal/admin/:studentId/prefs — admin updates prefs for a student
 *
 * CRON routes (internal/scheduled — no auth guard intentionally; call from cron only):
 *   POST  /api/portal/cron/send-reminders     — send lesson reminders for tomorrow
 *   POST  /api/portal/cron/send-debt-alerts   — send debt alerts for students over threshold
 *   POST  /api/portal/cron/send-package-alerts — send package low alerts
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, lt, lte, ne, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  portalNotificationPrefs,
  studentPortalTokens,
  students,
  lessons,
  studentLessons,
  notificationQueue,
} from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const r = result as { rows?: T[] };
  return r.rows ?? [];
}

/**
 * Get or create default notification prefs for a student.
 * Uses upsert pattern: returns existing prefs or default values (without DB write).
 */
async function getOrDefaultPrefs(tenantId: string, studentId: string) {
  const rows = normalizeRows<typeof portalNotificationPrefs.$inferSelect>(
    await db
      .select()
      .from(portalNotificationPrefs)
      .where(
        and(
          eq(portalNotificationPrefs.studentId, studentId),
          eq(portalNotificationPrefs.tenantId, tenantId)
        )
      )
      .limit(1)
  );

  if (rows[0]) return rows[0];

  // Return default shape (not persisted until student explicitly changes something)
  return {
    id: null as string | null,
    tenantId,
    studentId,
    lessonReminder: true,
    reminderHoursBefore: 24,
    debtAlert: true,
    debtThresholdCents: 20000,
    packageLowAlert: true,
    packageLowThreshold: 2,
    createdAt: null as Date | null,
    updatedAt: null as Date | null,
  };
}

// ─── Public router (token-based access) ──────────────────────────────────────
export const portalNotifsRoutes = new Hono();

/** GET /api/portal/:token/prefs — returns student notification preferences */
portalNotifsRoutes.get("/:token/prefs", async (c) => {
  const token = c.req.param("token");
  if (!UUID_REGEX.test(token)) return c.json({ error: "invalid_token" }, 401);

  const now = new Date();
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

  const prefs = await getOrDefaultPrefs(tokenRecord.tenantId, tokenRecord.studentId);
  return c.json({ prefs });
});

const updatePrefsSchema = z.object({
  lessonReminder: z.boolean().optional(),
  reminderHoursBefore: z.number().int().min(1).max(72).optional(),
  debtAlert: z.boolean().optional(),
  debtThresholdCents: z.number().int().min(0).optional(),
  packageLowAlert: z.boolean().optional(),
  packageLowThreshold: z.number().int().min(0).optional(),
});

/** PATCH /api/portal/:token/prefs — student updates notification preferences */
portalNotifsRoutes.patch(
  "/:token/prefs",
  zValidator("json", updatePrefsSchema),
  async (c) => {
    const token = c.req.param("token");
    if (!UUID_REGEX.test(token)) return c.json({ error: "invalid_token" }, 401);

    const now = new Date();
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

    const updates = c.req.valid("json");
    const { tenantId, studentId } = tokenRecord;

    // Upsert: insert if not exists, update if exists
    const existingRows = normalizeRows<typeof portalNotificationPrefs.$inferSelect>(
      await db
        .select()
        .from(portalNotificationPrefs)
        .where(and(eq(portalNotificationPrefs.studentId, studentId)))
        .limit(1)
    );

    if (existingRows[0]) {
      await db
        .update(portalNotificationPrefs)
        .set({ ...updates, updatedAt: now })
        .where(eq(portalNotificationPrefs.id, existingRows[0].id));
    } else {
      await db.insert(portalNotificationPrefs).values({
        tenantId,
        studentId,
        ...updates,
      });
    }

    const prefs = await getOrDefaultPrefs(tenantId, studentId);
    return c.json({ prefs });
  }
);

// ─── Admin router ─────────────────────────────────────────────────────────────
export const portalNotifsAdminRoutes = new Hono<{ Variables: AuthVariables }>();
portalNotifsAdminRoutes.use("*", requireAuth);

/** PATCH /api/portal/admin/:studentId/prefs — admin updates notification prefs */
portalNotifsAdminRoutes.patch(
  "/admin/:studentId/prefs",
  zValidator("json", updatePrefsSchema),
  async (c) => {
    const { studentId } = c.req.param();
    const { tenantId } = c.get("user");
    const updates = c.req.valid("json");
    const now = new Date();

    // Verify student belongs to tenant
    const studentRows = normalizeRows<typeof students.$inferSelect>(
      await db
        .select()
        .from(students)
        .where(and(eq(students.id, studentId), eq(students.tenantId, tenantId)))
        .limit(1)
    );
    if (!studentRows[0]) return c.json({ error: "student_not_found" }, 404);

    const existingRows = normalizeRows<typeof portalNotificationPrefs.$inferSelect>(
      await db
        .select()
        .from(portalNotificationPrefs)
        .where(eq(portalNotificationPrefs.studentId, studentId))
        .limit(1)
    );

    if (existingRows[0]) {
      await db
        .update(portalNotificationPrefs)
        .set({ ...updates, updatedAt: now })
        .where(eq(portalNotificationPrefs.id, existingRows[0].id));
    } else {
      await db.insert(portalNotificationPrefs).values({ tenantId, studentId, ...updates });
    }

    const prefs = await getOrDefaultPrefs(tenantId, studentId);
    return c.json({ prefs });
  }
);

// ─── Cron routes (call from scheduled job, no auth) ──────────────────────────
export const portalCronRoutes = new Hono();

/**
 * POST /api/portal/cron/send-reminders
 * Sends lesson reminders for lessons scheduled within the next reminderHoursBefore hours.
 * Queues into notification_queue (COMM-205).
 */
portalCronRoutes.post("/cron/send-reminders", async (c) => {
  const now = new Date();
  const windowHours = 26; // slightly wider than 24h to handle edge cases

  const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
  const windowStart = new Date(now.getTime() + 22 * 60 * 60 * 1000); // at least 22h ahead

  // Find all upcoming lessons within the reminder window
  const upcomingRows = normalizeRows<{
    lessonId: string;
    tenantId: string;
    studentId: string;
    scheduledAt: Date;
  }>(
    await db
      .select({
        lessonId: lessons.id,
        tenantId: lessons.tenantId,
        studentId: studentLessons.studentId,
        scheduledAt: lessons.scheduledAt,
      })
      .from(studentLessons)
      .innerJoin(lessons, eq(lessons.id, studentLessons.lessonId))
      .where(
        and(
          ne(lessons.status, "cancelled"),
          gte(lessons.scheduledAt, windowStart),
          sql`${lessons.scheduledAt} <= ${windowEnd.toISOString()}::timestamptz`
        )
      )
  );

  // For each lesson, check if student has reminders enabled
  let queued = 0;
  for (const row of upcomingRows) {
    const prefs = await getOrDefaultPrefs(row.tenantId, row.studentId);
    if (!prefs.lessonReminder) continue;

    // Check student has a phone number
    const studentRows = normalizeRows<typeof students.$inferSelect>(
      await db.select().from(students).where(eq(students.id, row.studentId)).limit(1)
    );
    const student = studentRows[0];
    if (!student?.phone && !student?.parentPhone && !student?.email && !student?.parentEmail) continue;

    // Queue notification
    const scheduledFor = new Date(row.scheduledAt.getTime() - prefs.reminderHoursBefore * 60 * 60 * 1000);
    if (scheduledFor < now) continue; // Already past send time

    await db.insert(notificationQueue).values({
      tenantId: row.tenantId,
      recipientType: "student",
      recipientId: row.studentId,
      channel: student.phone || student.parentPhone ? "sms" : "email",
      payload: {
        body: `Lecție programată ${new Intl.DateTimeFormat("ro-RO", { weekday: "long", hour: "2-digit", minute: "2-digit" }).format(row.scheduledAt)}`,
      },
      scheduledFor,
    });
    queued++;
  }

  return c.json({ ok: true, queued });
});

/**
 * POST /api/portal/cron/send-debt-alerts
 * Sends debt alerts to students with outstanding debt above their threshold.
 */
portalCronRoutes.post("/cron/send-debt-alerts", async (c) => {
  // Find students with debt > 0
  const debtStudents = normalizeRows<typeof students.$inferSelect>(
    await db
      .select()
      .from(students)
      .where(
        and(ne(students.status, "archived"), sql`${students.debtCents} > 0`)
      )
  );

  let queued = 0;
  for (const student of debtStudents) {
    const prefs = await getOrDefaultPrefs(student.tenantId, student.id);
    if (!prefs.debtAlert) continue;
    if (student.debtCents < prefs.debtThresholdCents) continue;

    const contact = student.parentEmail ?? student.email ?? student.parentPhone ?? student.phone;
    if (!contact) continue;

    await db.insert(notificationQueue).values({
      tenantId: student.tenantId,
      recipientType: "student",
      recipientId: student.id,
      channel: student.parentEmail || student.email ? "email" : "sms",
      payload: {
        body: `Aveți o datorie de ${(student.debtCents / 100).toFixed(2)} RON. Vă rugăm să achitați cât mai curând.`,
      },
      scheduledFor: new Date(),
    });
    queued++;
  }

  return c.json({ ok: true, queued });
});

/**
 * POST /api/portal/cron/send-package-alerts
 * Sends package low alerts (placeholder — lessonPackages are on GAP faza-2 branch).
 * Returns queued:0 until lessonPackages schema is merged.
 */
portalCronRoutes.post("/cron/send-package-alerts", async (c) => {
  // lessonPackages table is on GAP faza-2 branch, not yet on main.
  // This endpoint is a placeholder and returns 0 until packages are available.
  return c.json({ ok: true, queued: 0, note: "package_alerts_pending_schema_merge" });
});
