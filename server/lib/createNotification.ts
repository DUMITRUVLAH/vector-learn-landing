/**
 * CRM-123 — Server-side helper to create in-app inAppNotifications.
 * Used by leads routes (lead_created, lead_converted) and task cron jobs.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { inAppNotifications, users } from "../db/schema";
import type { NewInAppNotification } from "../db/schema";

export type NotificationPayload = Omit<NewInAppNotification, "id" | "createdAt">;

/**
 * Create a single notification record.
 * Silently ignores errors to avoid breaking the parent operation.
 */
export async function createNotification(payload: NotificationPayload): Promise<void> {
  try {
    await db.insert(inAppNotifications).values(payload);
  } catch {
    // Notifications are best-effort — never crash the caller
  }
}

/**
 * Notify all managers and owners in a tenant.
 * Used when a lead has no assigned_to.
 */
export async function notifyManagersAndOwners(
  tenantId: string,
  notification: Omit<NotificationPayload, "userId" | "tenantId">
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

    const targets = managers;

    if (targets.length === 0) return;

    await db.insert(inAppNotifications).values(
      targets.map((u) => ({
        ...notification,
        tenantId,
        userId: u.id,
      }))
    );
  } catch {
    // Best-effort
  }
}
