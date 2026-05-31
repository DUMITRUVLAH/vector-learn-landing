/**
 * FEEDBACK-601 — Client-side API helpers for /api/feedback
 */
import { api } from "../api";

export type FeedbackQuestionType = "rating" | "nps" | "text" | "yesno";
export type FeedbackInvitationStatus = "pending" | "submitted";

export interface FeedbackQuestion {
  id: string;
  formId: string;
  type: FeedbackQuestionType;
  label: string;
  required: boolean;
  position: number;
  createdAt: string;
}

export interface FeedbackForm {
  id: string;
  tenantId: string;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // enriched
  questions?: FeedbackQuestion[];
  totalInvitations?: number;
  submittedCount?: number;
  averageScore?: number | null;
  questionStats?: Array<{
    questionId: string;
    average: number | null;
    responseCount: number;
  }>;
}

export interface FeedbackInvitation {
  id: string;
  formId: string;
  studentId: string;
  token: string;
  status: FeedbackInvitationStatus;
  submittedAt: string | null;
  createdAt: string;
}

export interface CreateFormPayload {
  title: string;
  description?: string | null;
  questions: Array<{
    type: FeedbackQuestionType;
    label: string;
    required?: boolean;
    position?: number;
  }>;
}

export async function listFeedbackForms(): Promise<{ forms: FeedbackForm[] }> {
  return api<{ forms: FeedbackForm[] }>("/api/feedback");
}

export async function createFeedbackForm(
  payload: CreateFormPayload
): Promise<{ form: FeedbackForm }> {
  return api<{ form: FeedbackForm }>("/api/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getFeedbackForm(id: string): Promise<{ form: FeedbackForm }> {
  return api<{ form: FeedbackForm }>(`/api/feedback/${id}`);
}

export async function sendFeedbackToStudent(
  formId: string,
  studentId: string
): Promise<{ invitation: FeedbackInvitation; publicUrl: string }> {
  return api<{ invitation: FeedbackInvitation; publicUrl: string }>(
    `/api/feedback/${formId}/send`,
    {
      method: "POST",
      body: JSON.stringify({ studentId }),
    }
  );
}

export async function getFeedbackResponses(
  formId: string
): Promise<{ responses: Array<FeedbackInvitation & { answers: Array<{ questionId: string; value: string | null }> }> }> {
  return api(`/api/feedback/${formId}/responses`);
}

// ─── Public (no-auth) endpoints ───────────────────────────────────────────────

export interface PublicFeedbackForm {
  id: string;
  title: string;
  description: string | null;
  questions: FeedbackQuestion[];
  alreadySubmitted: boolean;
}

export async function getPublicFeedbackForm(
  token: string
): Promise<{ form: PublicFeedbackForm }> {
  const res = await fetch(`/api/feedback-public/${token}`, { credentials: "omit" });
  if (!res.ok) throw new Error(`Failed to load form: ${res.status}`);
  return res.json() as Promise<{ form: PublicFeedbackForm }>;
}

export async function submitFeedback(
  token: string,
  answers: Array<{ questionId: string; value: string | null }>
): Promise<{ ok: boolean }> {
  const res = await fetch(`/api/feedback-public/${token}/submit`, {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (res.status === 409) return { ok: false };
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`);
  return res.json() as Promise<{ ok: boolean }>;
}
