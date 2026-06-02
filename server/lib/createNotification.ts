/**
 * CRM-123 — Server-side helper to create in-app notifications.
 * Used by leads routes (lead_created, lead_converted) and task cron jobs.
 *
 * Supports two call patterns:
 *   1. Raw InAppNotification row (recipientUserId + payload jsonb)
 *   2. Legacy lead-notification shape (userId + type + title + body + link + metadata)
 *      — mapped transparently to the in-app notifications table.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { inAppNotifications, users } from "../db/schema";

/** Legacy lead-notification shape used by leads.ts routes */
export interface LeadNotificationPayload {
  tenantId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
  isRead?: boolean;
}

/** Raw in-app notification row shape (from mentions routes) */
export interface RawInAppNotificationPayload {
  tenantId: string;
  recipientUserId: string;
  payload: { body: string; lead_id?: string; interaction_id?: string; actor_name?: string };
  kind?: string;
}

export type NotificationPayload = LeadNotificationPayload | RawInAppNotificationPayload;

function isRaw(p: NotificationPayload): p is RawInAppNotificationPayload {
  return "recipientUserId" in p;
}

/**
 * Create a single in-app notification record.
 * Silently ignores errors to avoid breaking the parent operation.
 */
export async function createNotification(payload: NotificationPayload): Promise<void> {
  try {
    if (isRaw(payload)) {
      await db.insert(inAppNotifications).values({
        tenantId: payload.tenantId,
        recipientUserId: payload.recipientUserId,
        payload: payload.payload,
        kind: payload.kind ?? "mention",
      });
    } else if (payload.userId) {
      await db.insert(inAppNotifications).values({
        tenantId: payload.tenantId,
        recipientUserId: payload.userId,
        kind: payload.type ?? "system",
        payload: {
          body: [payload.title, payload.body].filter(Boolean).join(" — "),
          lead_id: payload.metadata?.leadId as string | undefined,
        },
      });
    }
    // If no userId — no-op (caller should use notifyManagersAndOwners instead)
  } catch {
    // Notifications are best-effort — never crash the caller
  }
}

/**
 * Notify all managers and admins in a tenant.
 * Used when a lead has no assigned_to.
 */
export async function notifyManagersAndOwners(
  tenantId: string,
  notification: Omit<LeadNotificationPayload, "tenantId" | "userId">
): Promise<void> {
  try {
    const managers = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.tenantId, tenantId),
          inArray(users.role, ["admin", "manager"])
        )
      );

    if (managers.length === 0) return;

    await db.insert(inAppNotifications).values(
      managers.map((u) => ({
        tenantId,
        recipientUserId: u.id,
        kind: notification.type ?? "system",
        payload: {
          body: [notification.title, notification.body].filter(Boolean).join(" — "),
          lead_id: notification.metadata?.leadId as string | undefined,
        },
      }))
    );
  } catch {
    // Best-effort
  }
}
