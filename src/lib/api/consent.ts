/**
 * CONSENT-001 — Client API pentru formulare de consimțământ
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConsentTemplate {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentRequest {
  id: string;
  templateId: string;
  studentId: string;
  guardianId: string;
  status: "pending" | "signed" | "declined";
  signedAt: string | null;
  signedByName: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  sentAt: string;
  createdAt: string;
  // joined fields
  templateTitle?: string | null;
  templateCategory?: string | null;
  studentName?: string | null;
  guardianName?: string | null;
}

export interface CreateTemplatePayload {
  title: string;
  body: string;
  category?: string | null;
  isActive?: boolean;
}

export interface CreateRequestsPayload {
  templateId: string;
  studentId: string;
  guardianIds: string[];
}

export interface CreateRequestsResult {
  created: number;
  skipped: number;
}

// ─── Template functions ───────────────────────────────────────────────────────

export async function listConsentTemplates(): Promise<{ templates: ConsentTemplate[] }> {
  return api<{ templates: ConsentTemplate[] }>("/api/school/consent/templates");
}

export async function createConsentTemplate(
  payload: CreateTemplatePayload
): Promise<{ template: ConsentTemplate }> {
  return api<{ template: ConsentTemplate }>("/api/school/consent/templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateConsentTemplate(
  templateId: string,
  payload: Partial<CreateTemplatePayload>
): Promise<{ template: ConsentTemplate }> {
  return api<{ template: ConsentTemplate }>(`/api/school/consent/templates/${templateId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteConsentTemplate(templateId: string): Promise<void> {
  await api<void>(`/api/school/consent/templates/${templateId}`, { method: "DELETE" });
}

// ─── Request functions ────────────────────────────────────────────────────────

export interface ListConsentRequestsFilters {
  studentId?: string;
  status?: string;
  templateId?: string;
}

export async function listConsentRequests(
  filters?: ListConsentRequestsFilters
): Promise<{ requests: ConsentRequest[] }> {
  const params = new URLSearchParams();
  if (filters?.studentId) params.set("studentId", filters.studentId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.templateId) params.set("templateId", filters.templateId);
  const qs = params.toString();
  return api<{ requests: ConsentRequest[] }>(
    `/api/school/consent/requests${qs ? `?${qs}` : ""}`
  );
}

export async function createConsentRequests(
  payload: CreateRequestsPayload
): Promise<CreateRequestsResult> {
  return api<CreateRequestsResult>("/api/school/consent/requests", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function signConsentRequest(
  requestId: string,
  name: string
): Promise<{ request: ConsentRequest }> {
  return api<{ request: ConsentRequest }>(`/api/school/consent/requests/${requestId}/sign`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function declineConsentRequest(
  requestId: string,
  reason?: string
): Promise<{ request: ConsentRequest }> {
  return api<{ request: ConsentRequest }>(`/api/school/consent/requests/${requestId}/decline`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
