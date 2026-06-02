/**
 * CRM-134: In-app notifications routes
 *
 * GET  /api/notifications/unread-count   → { count: N }
 * GET  /api/notifications                → { items: InAppNotification[] } (last 20)
 * PATCH /api/notifications/mark-read    → marks all unread as read; { updated: N }
 */
import { Hono } from "hono";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { inAppNotifications } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const notificationRoutes = new Hono<{ Variables: AuthVariables }>();

notificationRoutes.use("/*", requireAuth);

/** Returns count of unread in-app notifications for the current user. */
notificationRoutes.get("/unread-count", async (c) => {
  const userId = c.get("user").id;

  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(inAppNotifications)
    .where(
      and(
        eq(inAppNotifications.recipientUserId, userId),
        isNull(inAppNotifications.readAt)
      )
    );

  return c.json({ count: row?.count ?? 0 });
});

/** Returns the last 20 notifications for the current user (read + unread). */
notificationRoutes.get("/", async (c) => {
  const userId = c.get("user").id;

  const items = await db
    .select()
    .from(inAppNotifications)
    .where(eq(inAppNotifications.recipientUserId, userId))
    .orderBy(desc(inAppNotifications.createdAt))
    .limit(20);

  return c.json({ items });
});

/** Marks all unread notifications for the current user as read. */
notificationRoutes.patch("/mark-read", async (c) => {
  const userId = c.get("user").id;

  const updated = await db
    .update(inAppNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(inAppNotifications.recipientUserId, userId),
        isNull(inAppNotifications.readAt)
      )
    )
    .returning({ id: inAppNotifications.id });

  return c.json({ updated: updated.length });
});
