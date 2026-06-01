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

// ─── AI-A02: Churn prediction ─────────────────────────────────────────────────

export interface ChurnScoreEntry {
  id: string;
  studentId: string;
  score: number;
  factors: string[];
  trend: "rising" | "stable" | "falling";
  suggestedAction: string | null;
  scoredAt: string;
}

export interface ChurnScoreResult {
  updated: number;
  scores: Array<{
    studentId: string;
    studentName: string;
    score: number;
    factors: string[];
    trend: string;
  }>;
}

/**
 * Compute churn risk scores for all active students (or one student).
 */
export function computeChurnScores(studentId?: string): Promise<ChurnScoreResult> {
  return api<ChurnScoreResult>("/ai/churn", {
    method: "POST",
    body: JSON.stringify(studentId ? { studentId } : {}),
  });
}

/**
 * List cached churn scores.
 */
export function listChurnScores(params?: {
  minScore?: number;
  limit?: number;
}): Promise<ChurnScoreEntry[]> {
  const qs = new URLSearchParams();
  if (params?.minScore !== undefined) qs.set("minScore", String(params.minScore));
  if (params?.limit) qs.set("limit", String(params.limit));
  return api<ChurnScoreEntry[]>(`/ai/churn/scores?${qs.toString()}`);
}

/**
 * Mark a student's churn risk as resolved.
 */
export function resolveChurnScore(studentId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/ai/churn/scores/${studentId}`, {
    method: "DELETE",
  });
}
