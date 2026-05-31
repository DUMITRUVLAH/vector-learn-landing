import { api } from "../api";

export type FeedbackStage = "initial" | "mid" | "final";
export type FeedbackQuestionType = "rating" | "scale" | "single" | "multi" | "text" | "yesno";
export type FeedbackInvitationStatus = "pending" | "submitted";

export interface StageMeta {
  label: string;
  description: string;
}

export const STAGE_META: Record<FeedbackStage, StageMeta> = {
  initial: { label: "Feedback Inițial", description: "Trimis după prima săptămână de curs" },
  mid: { label: "Feedback Mijloc Curs", description: "Trimis la jumătatea cursului" },
  final: { label: "Feedback Final", description: "Trimis la finalul cursului" },
};

export const QUESTION_TYPE_LABEL: Record<FeedbackQuestionType, string> = {
  rating: "Rating (1–5 stele)",
  scale: "Scală (0–10)",
  single: "Alegere unică",
  multi: "Alegere multiplă",
  text: "Text liber",
  yesno: "Da / Nu",
};

export interface FeedbackQuestion {
  id: string;
  type: FeedbackQuestionType;
  label: string;
  options: string[];
  required: boolean;
  position: number;
}

export interface FeedbackForm {
  id: string;
  tenantId: string;
  stage: FeedbackStage;
  title: string;
  description: string | null;
  courseId: string | null;
  isActive: boolean;
  stageMeta: StageMeta;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackFormListItem extends FeedbackForm {
  questionCount: number;
  sentCount: number;
  submittedCount: number;
}

export interface FeedbackFormDetail extends FeedbackForm {
  questions: FeedbackQuestion[];
}

export interface QuestionInput {
  type: FeedbackQuestionType;
  label: string;
  options: string[];
  required: boolean;
}

export interface InvitationRow {
  id: string;
  studentId: string;
  studentName: string;
  status: FeedbackInvitationStatus;
  token: string;
  sentAt: string;
  submittedAt: string | null;
}

export interface QuestionResult {
  questionId: string;
  label: string;
  type: FeedbackQuestionType;
  count: number;
  average?: number | null;
  distribution?: Record<number, number>;
  yes?: number;
  no?: number;
  tally?: Record<string, number>;
  responses?: string[];
}

export interface FormResults {
  form: { id: string; title: string; stage: FeedbackStage; stageMeta: StageMeta };
  sentCount: number;
  submittedCount: number;
  responseRate: number;
  questions: QuestionResult[];
}

export function listStages(): Promise<{ stages: Array<{ stage: FeedbackStage } & StageMeta> }> {
  return api("/api/feedback/stages");
}

export function listForms(): Promise<{ items: FeedbackFormListItem[] }> {
  return api("/api/feedback");
}

export function getForm(id: string): Promise<FeedbackFormDetail> {
  return api(`/api/feedback/${id}`);
}

export function createForm(input: {
  stage: FeedbackStage;
  title: string;
  description?: string | null;
  courseId?: string | null;
  questions: QuestionInput[];
}): Promise<FeedbackFormDetail> {
  return api("/api/feedback", { method: "POST", body: JSON.stringify(input) });
}

export function updateForm(
  id: string,
  input: Partial<{
    title: string;
    description: string | null;
    courseId: string | null;
    isActive: boolean;
    questions: QuestionInput[];
  }>
): Promise<FeedbackFormDetail> {
  return api(`/api/feedback/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteForm(id: string): Promise<{ deleted: boolean }> {
  return api(`/api/feedback/${id}`, { method: "DELETE" });
}

export function sendForm(
  id: string,
  studentIds: string[]
): Promise<{ sent: number; skipped: number; alreadyInvited: number }> {
  return api(`/api/feedback/${id}/send`, {
    method: "POST",
    body: JSON.stringify({ studentIds }),
  });
}

export function listInvitations(id: string): Promise<{ items: InvitationRow[] }> {
  return api(`/api/feedback/${id}/invitations`);
}

export function getResults(id: string): Promise<FormResults> {
  return api(`/api/feedback/${id}/results`);
}

// --- Public (student-facing, token-based) ---

export interface PublicForm {
  alreadySubmitted: boolean;
  studentName: string | null;
  form: {
    id: string;
    title: string;
    description: string | null;
    stage: FeedbackStage;
    stageMeta: StageMeta;
  };
  questions: Array<Omit<FeedbackQuestion, "position">>;
}

export function getPublicForm(token: string): Promise<PublicForm> {
  return api(`/api/public/feedback/${token}`);
}

export function submitPublicForm(
  token: string,
  answers: Array<{ questionId: string; valueNumber?: number | null; valueText?: string | null }>
): Promise<{ ok: boolean }> {
  return api(`/api/public/feedback/${token}`, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

/** Default question sets per stage — used to pre-fill the builder when picking a template. */
export const DEFAULT_QUESTIONS: Record<FeedbackStage, QuestionInput[]> = {
  initial: [
    { type: "rating", label: "Cât de mulțumit ești de prima săptămână de curs?", options: [], required: true },
    { type: "yesno", label: "Profesorul a explicat clar obiectivele cursului?", options: [], required: true },
    { type: "single", label: "Ritmul cursului ți se pare:", options: ["Prea lent", "Potrivit", "Prea rapid"], required: true },
    { type: "text", label: "Ce ți-ai dori să se îmbunătățească?", options: [], required: false },
  ],
  mid: [
    { type: "scale", label: "Cât de probabil este să recomanzi cursul unui prieten? (0–10)", options: [], required: true },
    { type: "rating", label: "Cum evaluezi materialele de curs?", options: [], required: true },
    { type: "multi", label: "Ce îți place cel mai mult?", options: ["Profesorul", "Materialele", "Colegii", "Ritmul", "Temele"], required: false },
    { type: "text", label: "Ai întâmpinat dificultăți? Care?", options: [], required: false },
  ],
  final: [
    { type: "rating", label: "Cât de mulțumit ești de curs în general?", options: [], required: true },
    { type: "scale", label: "Cât de probabil este să te reînscrii? (0–10)", options: [], required: true },
    { type: "yesno", label: "Ți-ai atins obiectivele de învățare?", options: [], required: true },
    { type: "text", label: "Ce ai învățat cel mai valoros lucru?", options: [], required: false },
    { type: "text", label: "Recomandări pentru viitorii cursanți?", options: [], required: false },
  ],
};
