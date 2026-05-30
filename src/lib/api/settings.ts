/**
 * CRM-135: Settings API helpers — round-robin auto-assign
 */
import { api } from "../api";

export interface RRAssignSettings {
  enabled: boolean;
  userIds: string[];
  rrIndex: number;
  nextUser: { id: string; name: string } | null;
}

export interface TenantMemberOption {
  id: string;
  name: string;
  role: string;
}

/** Returns current round-robin config for the tenant. */
export async function getRRAssignSettings(): Promise<RRAssignSettings> {
  return api<RRAssignSettings>("/api/settings/rr-assign");
}

/** Updates round-robin config. Admin/manager only. */
export async function updateRRAssignSettings(
  enabled: boolean,
  userIds: string[]
): Promise<RRAssignSettings> {
  return api<RRAssignSettings>("/api/settings/rr-assign", {
    method: "PATCH",
    body: JSON.stringify({ enabled, userIds }),
  });
}
