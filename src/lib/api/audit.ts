import { api } from "../api";

export interface AuditEntry {
  id: string;
  tenantId: string;
  actorId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogResponse {
  entries: AuditEntry[];
  limit: number;
  offset: number;
}

export async function fetchAuditLog(params?: {
  limit?: number;
  offset?: number;
  entity_id?: string;
  actor_id?: string;
  action?: string;
}): Promise<AuditLogResponse> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  if (params?.entity_id) qs.set("entity_id", params.entity_id);
  if (params?.actor_id) qs.set("actor_id", params.actor_id);
  if (params?.action) qs.set("action", params.action);

  const url = `/api/audit-log${qs.toString() ? `?${qs.toString()}` : ""}`;
  return api<AuditLogResponse>(url);
}

export interface DeleteWithUndoResponse {
  deleted: boolean;
  undoToken: string;
  expiresAt: string;
}

export async function crmDeleteLead(leadId: string): Promise<DeleteWithUndoResponse> {
  return api<DeleteWithUndoResponse>(`/api/leads/${leadId}/crm-delete`, {
    method: "POST",
  });
}

export async function undoDeleteLead(token: string): Promise<{ restored: boolean; leadIds: string[] }> {
  return api<{ restored: boolean; leadIds: string[] }>(`/api/leads/undo/${token}`, {
    method: "POST",
  });
}
