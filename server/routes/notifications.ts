/**
 * CRM-123 — Notifications API
 * GET  /api/notifications          — list unread + recent (max 20)
 * PATCH /api/notifications/:id/read — mark one as read
 * POST /api/notifications/read-all  — mark all as read
 */
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { notifications } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { sql } from "drizzle-orm";

export const notificationRoutes = new Hono<{ Variables: AuthVariables }>();

notificationRoutes.use("/*", requireAuth);

/** GET /api/notifications — unread + recent 20 notifications */
notificationRoutes.get("/", async (c) => {
  const user = c.get("user");

  const items = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, user.tenantId),
        eq(notifications.userId, user.id)
      )
    )
    .orderBy(desc(notifications.createdAt))
    .limit(20);

  // Count unread
  const unreadResult = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.tenantId, user.tenantId),
        eq(notifications.userId, user.id),
        eq(notifications.isRead, false)
      )
    );

  const rows = Array.isArray(unreadResult) ? unreadResult : (unreadResult as unknown as typeof unreadResult);
  const unreadCount = Number(rows[0]?.cnt ?? 0);

  return c.json({ items, unreadCount });
});

/** PATCH /api/notifications/:id/read — mark one notification as read */
notificationRoutes.patch("/:id/read", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, id),
        eq(notifications.tenantId, user.tenantId),
        eq(notifications.userId, user.id)
      )
    )
    .returning();

  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

/** POST /api/notifications/read-all — mark all notifications as read for this user */
notificationRoutes.post("/read-all", async (c) => {
  const user = c.get("user");

  await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.tenantId, user.tenantId),
        eq(notifications.userId, user.id),
        eq(notifications.isRead, false)
      )
    );

  return c.json({ ok: true });
});
