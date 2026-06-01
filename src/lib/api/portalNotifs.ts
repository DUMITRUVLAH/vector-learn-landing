/**
 * GAP-017 — Client-side API helpers for portal notification preferences
 */
import { api } from "../api";

export interface PortalNotificationPrefs {
  id?: string | null;
  tenantId?: string;
  studentId?: string;
  lessonReminder: boolean;
  reminderHoursBefore: number;
  debtAlert: boolean;
  debtThresholdCents: number;
  packageLowAlert: boolean;
  packageLowThreshold: number;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export type UpdatePortalNotifPrefsPayload = Partial<Pick<
  PortalNotificationPrefs,
  | "lessonReminder"
  | "reminderHoursBefore"
  | "debtAlert"
  | "debtThresholdCents"
  | "packageLowAlert"
  | "packageLowThreshold"
>>;

/** GET /api/portal/:token/prefs — get notification preferences (public, token-based) */
export async function getPortalNotifPrefs(token: string): Promise<{ prefs: PortalNotificationPrefs }> {
  return api<{ prefs: PortalNotificationPrefs }>(`/api/portal/${token}/prefs`);
}

/** PATCH /api/portal/:token/prefs — update notification preferences (public, token-based) */
export async function updatePortalNotifPrefs(
  token: string,
  payload: UpdatePortalNotifPrefsPayload
): Promise<{ prefs: PortalNotificationPrefs }> {
  return api<{ prefs: PortalNotificationPrefs }>(`/api/portal/${token}/prefs`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/** PATCH /api/portal/admin/:studentId/prefs — admin updates prefs (requires auth) */
export async function adminUpdatePortalNotifPrefs(
  studentId: string,
  payload: UpdatePortalNotifPrefsPayload
): Promise<{ prefs: PortalNotificationPrefs }> {
  return api<{ prefs: PortalNotificationPrefs }>(`/api/portal/admin/${studentId}/prefs`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
