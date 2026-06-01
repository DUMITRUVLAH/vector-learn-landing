/**
 * AI-A01 — Client-side API helpers for AI endpoints.
 */
import { api } from "../api";

export interface LessonSummaryRequest {
  lessonId?: string;
  teacherNotes: string;
  studentName?: string;
}

export interface LessonSummaryResponse {
  summary: string;
  auditId: string;
  model: string;
  isStub: boolean;
  pseudonymized: boolean;
}

export interface ApproveSummaryResponse {
  messageId: string;
  approved: boolean;
  note: string;
}

export interface AiAuditEntry {
  id: string;
  action: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsdMicro: number;
  pseudonymized: boolean;
  status: string;
  entityType: string | null;
  entityId: string | null;
  note: string | null;
  createdAt: string;
}

/**
 * Generate a lesson summary from teacher notes.
 */
export function generateLessonSummary(
  body: LessonSummaryRequest
): Promise<LessonSummaryResponse> {
  return api<LessonSummaryResponse>("/ai/lesson-summary", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Approve an AI-generated summary (human-in-the-loop confirmation).
 */
export function approveLessonSummary(
  auditId: string,
  editedSummary?: string
): Promise<ApproveSummaryResponse> {
  return api<ApproveSummaryResponse>(`/ai/lesson-summary/${auditId}/approve`, {
    method: "POST",
    body: JSON.stringify({ editedSummary }),
  });
}

/**
 * List AI audit log entries for the current tenant.
 */
export function listAiAuditLog(params?: { limit?: number }): Promise<AiAuditEntry[]> {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  return api<AiAuditEntry[]>(`/ai/audit-log?${qs.toString()}`);
}
