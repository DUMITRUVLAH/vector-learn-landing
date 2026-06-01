/**
 * FORMS-001 — Funcții client pentru API-ul de formulare
 */
import { api } from "../api";

// ─── Tipuri ───────────────────────────────────────────────────────────────────

export type FormFieldType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "number"
  | "single_choice"
  | "multiple_choice"
  | "dropdown"
  | "rating"
  | "yes_no"
  | "date"
  | "consent"
  | "hidden";

export type FormStatus = "draft" | "published" | "closed";
export type FormSubmissionStatus = "partial" | "complete";
export type LeadMapping = "fullName" | "phone" | "email" | "interestCourse" | "tag" | "none";

export interface FormField {
  id: string;
  tenantId: string;
  formId: string;
  type: FormFieldType;
  label: string;
  placeholder: string | null;
  required: boolean;
  position: number;
  options: string[] | null;
  leadMapping: LeadMapping | null;
  hidden: boolean;
  hiddenSourceParam: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Form {
  id: string;
  tenantId: string;
  title: string;
  slug: string;
  status: FormStatus;
  description: string | null;
  thankYouMessage: string | null;
  redirectUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FormSubmission {
  id: string;
  tenantId: string;
  formId: string;
  answers: Record<string, unknown>;
  leadId: string | null;
  utm: {
    source?: string;
    medium?: string;
    campaign?: string;
    fbclid?: string;
    gclid?: string;
  } | null;
  status: FormSubmissionStatus;
  ip: string | null;
  submittedAt: string;
}

// ─── Public form (vizibil vizitatorilor) ──────────────────────────────────────

export interface PublicFormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder: string | null;
  required: boolean;
  position: number;
  options: string[] | null;
  leadMapping: LeadMapping | null;
  hidden: boolean;
  hiddenSourceParam: string | null;
}

// ─── FORMS-004: Logică condițională ───────────────────────────────────────────

export type LogicOperator = "eq" | "neq" | "contains" | "gt" | "lt" | "is_empty" | "is_not_empty";
export type LogicAction = "jump_to_field" | "jump_to_end";

export interface FormLogicCondition {
  operator: LogicOperator;
  value?: string | number;
}

export interface FormLogicRule {
  id: string;
  formId: string;
  fromFieldId: string;
  condition: FormLogicCondition;
  action: LogicAction;
  targetFieldId: string | null;
  position: number;
}

export interface PublicForm {
  id: string;
  title: string;
  description: string | null;
  thankYouMessage: string | null;
  redirectUrl: string | null;
  fields: PublicFormField[];
  /** FORMS-004: reguli de logică incluse în răspunsul public */
  logic?: FormLogicRule[];
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CreateFormPayload {
  title: string;
  slug: string;
  description?: string | null;
  thankYouMessage?: string | null;
  redirectUrl?: string | null;
}

export interface UpdateFormPayload {
  title?: string;
  description?: string | null;
  thankYouMessage?: string | null;
  redirectUrl?: string | null;
}

export interface CreateFieldPayload {
  type: FormFieldType;
  label: string;
  placeholder?: string | null;
  required?: boolean;
  position?: number;
  options?: string[] | null;
  leadMapping?: LeadMapping | null;
  hidden?: boolean;
  hiddenSourceParam?: string | null;
}

export interface UpdateFieldPayload {
  type?: FormFieldType;
  label?: string;
  placeholder?: string | null;
  required?: boolean;
  position?: number;
  options?: string[] | null;
  leadMapping?: LeadMapping | null;
  hidden?: boolean;
  hiddenSourceParam?: string | null;
}

export interface SubmitFormPayload {
  answers: Record<string, unknown>;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    fbclid?: string;
    gclid?: string;
  };
  hidden?: Record<string, string>;
}

export interface SubmitFormResult {
  ok: boolean;
  leadCreated: boolean;
  leadId: string | null;
}

// ─── Admin API ────────────────────────────────────────────────────────────────

export async function listForms(): Promise<{ items: Form[] }> {
  return api<{ items: Form[] }>("/api/forms");
}

export async function createForm(payload: CreateFormPayload): Promise<{ form: Form }> {
  return api<{ form: Form }>("/api/forms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getForm(id: string): Promise<{ form: Form; fields: FormField[] }> {
  return api<{ form: Form; fields: FormField[] }>(`/api/forms/${id}`);
}

export async function updateForm(id: string, payload: UpdateFormPayload): Promise<{ form: Form }> {
  return api<{ form: Form }>(`/api/forms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteForm(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/forms/${id}`, { method: "DELETE" });
}

export async function publishForm(id: string): Promise<{ form: Form }> {
  return api<{ form: Form }>(`/api/forms/${id}/publish`, { method: "POST" });
}

export async function addField(
  formId: string,
  payload: CreateFieldPayload
): Promise<{ field: FormField }> {
  return api<{ field: FormField }>(`/api/forms/${formId}/fields`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateField(
  formId: string,
  fieldId: string,
  payload: UpdateFieldPayload
): Promise<{ field: FormField }> {
  return api<{ field: FormField }>(`/api/forms/${formId}/fields/${fieldId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteField(
  formId: string,
  fieldId: string
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/forms/${formId}/fields/${fieldId}`, {
    method: "DELETE",
  });
}

export async function reorderFields(
  formId: string,
  ids: string[]
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/forms/${formId}/fields/reorder`, {
    method: "PUT",
    body: JSON.stringify({ ids }),
  });
}

export async function getFormSubmissions(
  formId: string
): Promise<{ items: FormSubmission[] }> {
  return api<{ items: FormSubmission[] }>(`/api/forms/${formId}/submissions`);
}

// ─── FORMS-004: Admin API pentru logică condițională ─────────────────────────

export async function listLogicRules(formId: string): Promise<{ rules: FormLogicRule[] }> {
  return api<{ rules: FormLogicRule[] }>(`/api/forms/${formId}/logic`);
}

export interface CreateLogicRulePayload {
  fromFieldId: string;
  condition: FormLogicCondition;
  action: LogicAction;
  targetFieldId?: string | null;
  position?: number;
}

export async function addLogicRule(
  formId: string,
  payload: CreateLogicRulePayload
): Promise<{ rule: FormLogicRule }> {
  return api<{ rule: FormLogicRule }>(`/api/forms/${formId}/logic`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteLogicRule(
  formId: string,
  ruleId: string
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/forms/${formId}/logic/${ruleId}`, {
    method: "DELETE",
  });
}

// ─── Public API (fără autentificare) ─────────────────────────────────────────

export async function getPublicForm(slug: string): Promise<{ form: PublicForm }> {
  const res = await fetch(`/api/public/forms/${slug}`, { credentials: "omit" });
  if (!res.ok) {
    const err = Object.assign(new Error(`Formularul nu a fost găsit: ${res.status}`), {
      status: res.status,
    });
    throw err;
  }
  return res.json() as Promise<{ form: PublicForm }>;
}

export async function submitPublicForm(
  slug: string,
  payload: SubmitFormPayload
): Promise<SubmitFormResult> {
  const res = await fetch(`/api/public/forms/${slug}/submit`, {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const error = new Error(String(body.error ?? `Submit eșuat: ${res.status}`)) as Error & {
      status: number;
      body: Record<string, unknown>;
    };
    (error as { status: number }).status = res.status;
    (error as { body: Record<string, unknown> }).body = body;
    throw error;
  }
  return res.json() as Promise<SubmitFormResult>;
}

// ─── FORMS-005: Analytics ─────────────────────────────────────────────────────

export interface FormAnalytics {
  views: number;
  starts: number;
  completions: number;
  completionRate: number;
  leadsCreated: number;
}

/**
 * GET /api/forms/:id/analytics — statistici per formular (admin, auth)
 */
export async function getFormAnalytics(formId: string): Promise<FormAnalytics> {
  return api<FormAnalytics>(`/api/forms/${formId}/analytics`);
}

/**
 * POST /api/public/forms/:slug/ping — analytics event (fără auth, fire-and-forget)
 * Nu aruncă — erorile de rețea sunt ignorate silențios.
 */
export async function pingFormEvent(slug: string, event: "view" | "start"): Promise<void> {
  try {
    await fetch(`/api/public/forms/${slug}/ping`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    });
  } catch {
    // fire-and-forget — erori ignorate
  }
}
