import { api } from "../api";

export type NotificationType = "task_due" | "lead_converted" | "lead_created" | "system";

export interface AppNotification {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationsResponse {
  items: AppNotification[];
  unreadCount: number;
}

export function listNotifications(): Promise<NotificationsResponse> {
  return api<NotificationsResponse>("/api/notifications");
}

export function markRead(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllRead(): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/notifications/read-all", { method: "POST" });
}
