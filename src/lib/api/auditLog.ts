/**
 * HR-404 — Client-side API helpers for audit log.
 */
import { api } from "../api";

export interface AuditLogEntry {
  id: string;
  actionType: string;
  targetType: string;
  targetId: string | null;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  occurredAt: string;
  actorName: string | null;
}

export function listAuditLog(params: {
  action_type?: string;
  limit?: number;
}): Promise<{ items: AuditLogEntry[] }> {
  const qs = new URLSearchParams();
  if (params.action_type) qs.set("action_type", params.action_type);
  if (params.limit) qs.set("limit", String(params.limit));
  return api<{ items: AuditLogEntry[] }>(`/hr/audit-log?${qs.toString()}`);
}
