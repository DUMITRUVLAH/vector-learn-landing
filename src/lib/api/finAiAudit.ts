/**
 * TRUST-002: FinDesk AI Audit Log API client
 */
import { api } from "../api";

export interface AiAuditEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsdMicro: number;
  pseudonymized: boolean;
  entityType: string | null;
  entityId: string | null;
  status: string;
  note: string | null;
  createdAt: string;
}

export interface AiAuditListResponse {
  data: AiAuditEntry[];
  total: number;
  page: number;
}

export interface AiAuditPurgeResponse {
  deleted: number;
}

export async function listAiAuditLog(params?: {
  page?: number;
  limit?: number;
  action?: string;
  from?: string;
  to?: string;
}): Promise<AiAuditListResponse> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set("page", String(params.page));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.action) qs.set("action", params.action);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const url = `/api/fin/ai-audit${qs.toString() ? `?${qs.toString()}` : ""}`;
  return api<AiAuditListResponse>(url);
}

export async function purgeAiAuditLog(): Promise<AiAuditPurgeResponse> {
  return api<AiAuditPurgeResponse>("/api/fin/ai-audit/purge", {
    method: "POST",
  });
}
