/**
 * MOB-103: Web Push VAPID utility
 * Sends push notifications to subscribed users.
 * Gracefully no-ops if VAPID env vars are not set (dev/test safety).
 * On 410 (expired subscription) → deletes the subscription from DB.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { pushSubscriptions } from "../db/schema";

interface PushPayload {
  title: string;
  body: string;
  category: string;
  url?: string;
  icon?: string;
}

interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  keysP256dh: string;
  keysAuth: string;
  categories: unknown;
}

/**
 * Check if push is configured (VAPID keys present).
 * Returns false silently if not configured — app works without push.
 */
function isPushConfigured(): boolean {
  return !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_EMAIL
  );
}

/**
 * Check quiet hours (do not push between 22:00 and 07:00 local time).
 * Uses UTC+2 as default (Romania). In production, use the tenant's timezone.
 */
function isQuietHours(): boolean {
  const nowUTC = new Date();
  // Romania is UTC+2 (UTC+3 in summer, simplified to +2 here)
  const hourRO = (nowUTC.getUTCHours() + 2) % 24;
  return hourRO >= 22 || hourRO < 7;
}

/**
 * Send a Web Push notification to all of a user's subscriptions.
 * - If VAPID keys not set → silently returns.
 * - If quiet hours → silently returns.
 * - On 410 expired subscription → deletes it from DB.
 * - Never throws — catches all errors internally.
 */
export async function sendPush(
  userId: string,
  tenantId: string,
  payload: PushPayload
): Promise<void> {
  try {
    if (!isPushConfigured()) return;
    if (isQuietHours()) return;

    // Load web-push dynamically (optional dep — avoids crash if not installed)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let webpush: any;
    try {
      // Dynamic import avoids compile-time dependency on web-push types
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      webpush = await import("web-push" as string);
    } catch {
      return; // web-push not installed — no-op
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    webpush.setVapidDetails(
      `mailto:${process.env.VAPID_EMAIL!}`,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    const serialized = JSON.stringify(payload);

    await Promise.allSettled(
      subs
        .filter((sub) => {
          // Check if this subscription has the category enabled
          const cats = Array.isArray(sub.categories)
            ? (sub.categories as string[])
            : ["homework", "schedule_change", "grades"];
          return cats.includes(payload.category);
        })
        .map(async (sub: PushSubscriptionRecord) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.keysP256dh,
                  auth: sub.keysAuth,
                },
              },
              serialized
            );
          } catch (err: unknown) {
            const status = (err as { statusCode?: number })?.statusCode;
            if (status === 410 || status === 404) {
              // Subscription expired — clean up
              await db
                .delete(pushSubscriptions)
                .where(eq(pushSubscriptions.id, sub.id))
                .catch(() => undefined);
            }
            // Other errors: log silently, don't rethrow
            console.error(`[push] Failed to send to ${sub.id.slice(0, 8)}: status=${status}`);
          }
        })
    );
  } catch (err) {
    // Never throw from sendPush — it's a fire-and-forget utility
    console.error("[push] Unexpected error:", err);
  }
}
