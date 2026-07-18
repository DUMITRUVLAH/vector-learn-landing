/**
 * CRM-134: In-app notifications routes
 *
 * GET  /api/notifications/unread-count   → { count: N }
 * GET  /api/notifications                → { items: AppNotification[], unreadCount } (last 20, rich shape)
 * PATCH /api/notifications/mark-read     → marks all unread as read; { updated: N }
 * PATCH /api/notifications/:id/read      → marks a single notification as read; { ok, updated }
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

// PARQA-002: the NotificationBell renders { type, title, body, link, isRead } and reads a top-level
// unreadCount — but raw in_app_notifications rows only carry { kind, payload:{body,...}, readAt }. Map
// them server-side here (one place, all kinds) into the rich shape the bell expects, and derive a
// deep-link from the payload so clicking a notification navigates to the right record.
const KIND_TITLES: Record<string, string> = {
  par: "Cerere de plată",
  mention: "Mențiune",
  lead_created: "Lead nou",
  lead_converted: "Lead convertit",
  budget: "Buget",
  system: "Notificare",
};

interface NotifPayload {
  body?: string;
  par_id?: string;
  lead_id?: string;
  interaction_id?: string;
  actor_name?: string;
}

function mapNotification(row: typeof inAppNotifications.$inferSelect) {
  const payload = (row.payload ?? {}) as NotifPayload;
  const kind = row.kind ?? "system";
  let link: string | null = null;
  if (payload.par_id) link = `#/business/par/${payload.par_id}`;
  else if (payload.lead_id) link = `#/app/leads/${payload.lead_id}`;
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.recipientUserId,
    type: kind,
    title: KIND_TITLES[kind] ?? "Notificare",
    body: payload.body ?? "",
    link,
    isRead: row.readAt != null,
    createdAt: row.createdAt,
  };
}

/** Returns the last 20 notifications (rich shape) + the total unread count for the current user. */
notificationRoutes.get("/", async (c) => {
  const userId = c.get("user").id;

  const rows = await db
    .select()
    .from(inAppNotifications)
    .where(eq(inAppNotifications.recipientUserId, userId))
    .orderBy(desc(inAppNotifications.createdAt))
    .limit(20);

  const [cnt] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(inAppNotifications)
    .where(
      and(
        eq(inAppNotifications.recipientUserId, userId),
        isNull(inAppNotifications.readAt)
      )
    );

  return c.json({ items: rows.map(mapNotification), unreadCount: cnt?.count ?? 0 });
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

/** PARQA-002: marks a SINGLE notification as read. The bell calls this on click; the route was
 * missing before (only /mark-read existed), so every single mark-read 404'd. Idempotent. */
notificationRoutes.patch("/:id/read", async (c) => {
  const userId = c.get("user").id;
  const id = c.req.param("id");

  const updated = await db
    .update(inAppNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(inAppNotifications.id, id),
        eq(inAppNotifications.recipientUserId, userId),
        isNull(inAppNotifications.readAt)
      )
    )
    .returning({ id: inAppNotifications.id });

  return c.json({ ok: true, updated: updated.length });
});
