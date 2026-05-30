/**
 * CRM-134/135: Notifications and tenant members API helpers
 */
import { api } from "../api";

export interface InAppNotificationPayload {
  body: string;
  lead_id?: string;
  interaction_id?: string;
  actor_name?: string;
}

export interface InAppNotification {
  id: string;
  tenantId: string;
  recipientUserId: string;
  payload: InAppNotificationPayload;
  kind: string;
  readAt: string | null;
  createdAt: string;
}

export interface TenantMember {
  id: string;
  name: string;
  role: string;
}

/** Returns count of unread in-app notifications for the current user. */
export async function getUnreadCount(): Promise<{ count: number }> {
  return api<{ count: number }>("/api/notifications/unread-count");
}

/** Returns last 20 notifications (read + unread) for the current user. */
export async function listNotifications(): Promise<{ items: InAppNotification[] }> {
  return api<{ items: InAppNotification[] }>("/api/notifications");
}

/** Marks all unread notifications as read. */
export async function markAllRead(): Promise<{ updated: number }> {
  return api<{ updated: number }>("/api/notifications/mark-read", { method: "PATCH" });
}

/** Returns all users in the current tenant (for @mention autocomplete and RR settings). */
export async function getTenantMembers(): Promise<{ members: TenantMember[] }> {
  return api<{ members: TenantMember[] }>("/api/users/tenant-members");
}
