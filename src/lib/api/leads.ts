import { api } from "../api";

export type LeadStage = "new" | "contacted" | "trial" | "paid" | "lost";
export type LeadSource =
  | "webform"
  | "manual"
  | "facebook_ad"
  | "google_ads"
  | "referral"
  | "phone_in"
  | "instagram"
  | "import"
  | "other";

export interface Lead {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  interestCourse: string | null;
  stage: string;  // string to support custom pipeline stage keys
  source: LeadSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  notes: string | null;
  assignedTo: string | null;
  consentAt: string | null;
  consentText: string | null;
  ipAtConsent: string | null;
  consentRevokedAt: string | null;
  convertedToStudentId: string | null;
  convertedAt: string | null;
  lostReason: string | null;
  /** CRM-111: Lead score 0-100 (hot ≥70, warm ≥40, cold <40) */
  score?: number | null;
  /** CRM-113: Deal value in euro-cents */
  valueCents: number;
  /** CRM-113: Remaining debt in euro-cents */
  debtCents: number;
  /** CRM-114: Company name for B2B leads */
  company?: string | null;
  /** CRM-114: Deal name — if set, used as display title */
  dealName?: string | null;
  /** Next open task (from pipeline endpoint, augmented server-side) */
  nextTask?: { dueAt: string | null; title: string } | null;
  /** CRM-124: SLA response time badge — computed server-side */
  slaBadge?: "green" | "yellow" | "red" | null;
  createdAt: string;
  updatedAt: string;
}

export interface DedupResult {
  duplicate: { id: string; fullName: string; stage: string } | null;
}

/** Metadata stored with an interaction (template_id, call outcome, etc.) — CRM-109 */
export interface InteractionMetadata {
  template_id?: string;
  outcome?: "interested" | "not_interested" | "wrong_number" | "no_answer";
  duration_seconds?: number | null;
  recording_url?: string | null;
  subject?: string;
  channel?: string;
  stub?: boolean;
  [key: string]: unknown;
}

export interface LeadInteraction {
  id: string;
  leadId: string;
  type: "note" | "call" | "email" | "whatsapp" | "sms" | "meeting" | "stage_change" | "system";
  direction: "inbound" | "outbound" | "internal";
  body: string | null;
  /** JSONB metadata: template_id, call outcome/duration, etc. */
  metadata?: InteractionMetadata | null;
  userId: string | null;
  occurredAt: string;
}

export interface PipelineResponse {
  grouped: Record<string, Lead[]>;
  counts: Record<string, number>;
  /** CRM-113: Σ value_cents per stage key */
  valueSums: Record<string, number>;
  /** CRM-113: Grand total value_cents across all stages */
  totalValueCents: number;
}

/** CRM-117: Paginated list response */
export interface LeadsListResponse {
  items: (Lead & { nextTask?: { dueAt: string | null; title: string } | null })[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ListSortCol =
  | "fullName" | "company" | "stage" | "source"
  | "valueCents" | "debtCents" | "createdAt" | "updatedAt";

/** CRM-117: Fetch paginated + sorted lead list */
export function fetchLeadsList(params: {
  page?: number;
  pageSize?: number;
  sort?: ListSortCol;
  dir?: "asc" | "desc";
  search?: string;
  source?: string;
  assignedTo?: string;
  stage?: string;
}): Promise<LeadsListResponse> {
  const qs = new URLSearchParams();
  qs.set("view", "list");
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params.sort) qs.set("sort", params.sort);
  if (params.dir) qs.set("dir", params.dir);
  if (params.search) qs.set("search", params.search);
  if (params.source && params.source !== "all") qs.set("source", params.source);
  if (params.assignedTo && params.assignedTo !== "all") qs.set("assignedTo", params.assignedTo);
  if (params.stage && params.stage !== "all") qs.set("stage", params.stage);
  return api<LeadsListResponse>(`/api/leads?${qs.toString()}`);
}

export function fetchPipeline(): Promise<PipelineResponse> {
  return api<PipelineResponse>("/api/leads/pipeline");
}

// ─── CRM-120: Today dashboard ─────────────────────────────────────────────────

export interface TodayDashboardItem {
  id: string;
  fullName: string;
  stage: string;
  phone: string | null;
  interestCourse: string | null;
  valueCents: number;
  reason: string;
}

export interface TodayDashboardTask {
  taskId: string;
  taskTitle: string;
  dueAt: string | null;
  leadId: string;
  leadFullName: string;
  leadStage: string;
  leadPhone: string | null;
  leadInterestCourse: string | null;
  leadValueCents: number;
}

export interface TodayNBAItem {
  id: string;
  fullName: string;
  stage: string;
  phone: string | null;
  interestCourse: string | null;
  valueCents: number;
  score: number | null;
  ageDays: number;
}

/** CRM-124: SLA badge color for response time */
export type SlaBadge = "green" | "yellow" | "red";

export interface TodayDashboardResponse {
  overdueOrDueToday: TodayDashboardTask[];
  newUncontacted: (TodayDashboardItem & { source: string; createdAt: string; slaBadge?: SlaBadge; minutesSinceCreated?: number })[];
  followUpNeeded: (TodayDashboardItem & { updatedAt: string })[];
  nextBestAction: TodayNBAItem[];
  /** CRM-124: Neglected leads (no contact > rot_days) */
  neglected?: (TodayDashboardItem & { daysSinceCreated: number })[];
  totalActions: number;
  /** CRM-124: SLA config from tenant settings */
  slaConfig?: { slaHotMinutes: number; slaDefaultHours: number; rotDays: number };
}

export function fetchTodayDashboard(): Promise<TodayDashboardResponse> {
  return api<TodayDashboardResponse>("/api/leads/today");
}

/** CRM-124: Fetch SLA config for current tenant */
export function fetchSlaConfig(): Promise<{ slaHotMinutes: number; slaDefaultHours: number; rotDays: number }> {
  return api<{ slaHotMinutes: number; slaDefaultHours: number; rotDays: number }>("/api/leads/today/sla-config");
}

/** CRM-124: Update SLA config */
export function updateSlaConfig(input: { slaHotMinutes?: number; slaDefaultHours?: number; rotDays?: number }): Promise<{ slaHotMinutes: number; slaDefaultHours: number; rotDays: number }> {
  return api<{ slaHotMinutes: number; slaDefaultHours: number; rotDays: number }>("/api/leads/today/sla-config", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getLead(id: string): Promise<Lead> {
  return api<Lead>(`/api/leads/${id}`);
}

export function listInteractions(leadId: string): Promise<{ items: LeadInteraction[] }> {
  return api<{ items: LeadInteraction[] }>(`/api/leads/${leadId}/interactions`);
}

export function createLead(input: {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  interestCourse?: string | null;
  source?: LeadSource;
  notes?: string | null;
  assignedTo?: string | null;
  valueCents?: number;
  debtCents?: number;
  company?: string | null;
  dealName?: string | null;
  /** CRM-141: initial pipeline stage for direct-to-column creation */
  stage?: string;
}): Promise<Lead> {
  return api<Lead>("/api/leads", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function moveLeadStage(
  id: string,
  stage: string,  // string to support custom pipeline stage keys
  lostReason?: string
): Promise<Lead> {
  return api<Lead>(`/api/leads/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage, lostReason: lostReason ?? null }),
  });
}

export function checkDuplicate(input: {
  phone?: string;
  email?: string;
}): Promise<DedupResult> {
  return api<DedupResult>("/api/leads/dedup-check", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function addInteraction(
  leadId: string,
  input: {
    type: "note" | "call" | "email" | "whatsapp" | "sms" | "meeting";
    direction?: "inbound" | "outbound" | "internal";
    body: string;
  }
): Promise<LeadInteraction> {
  return api<LeadInteraction>(`/api/leads/${leadId}/interactions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateLead(
  id: string,
  patch: Partial<Pick<Lead, "fullName" | "phone" | "email" | "interestCourse" | "notes" | "assignedTo" | "valueCents" | "debtCents" | "company" | "dealName">>
): Promise<Lead> {
  return api<Lead>(`/api/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** CRM-111: Enhanced convert with optional family/payer data */
export function convertLead(
  id: string,
  input?: {
    payerName?: string | null;
    payerPhone?: string | null;
    payerEmail?: string | null;
    studentName?: string | null;
    studentPhone?: string | null;
    studentEmail?: string | null;
    birthDate?: string | null;
    studentStatus?: "active" | "trial";
  }
): Promise<{
  lead: Lead;
  student: { id: string; fullName: string; familyId?: string | null };
  familyId: string | null;
  /** INTEG-201: auto-enrolled cohort id, or null if no cohort found/applicable */
  autoEnrolledCohortId: string | null;
}> {
  return api<{
    lead: Lead;
    student: { id: string; fullName: string; familyId?: string | null };
    familyId: string | null;
    autoEnrolledCohortId: string | null;
  }>(
    `/api/leads/${id}/convert`,
    { method: "POST", body: JSON.stringify(input ?? {}) }
  );
}

/** CRM-111: Assign lead to a user (reasignare) */
export function assignLead(
  id: string,
  assignedTo: string | null
): Promise<Lead> {
  return api<Lead>(`/api/leads/${id}/assign`, {
    method: "POST",
    body: JSON.stringify({ assignedTo }),
  });
}

/** CRM-111/CRM-145: Calculate and save lead score. Returns factors for the explainer UI. */
export interface ScoreFactor { label: string; points: number; }
export function scoreLead(id: string): Promise<{ lead: Lead; score: number; badge: "hot" | "warm" | "cold"; factors: ScoreFactor[] }> {
  return api<{ lead: Lead; score: number; badge: "hot" | "warm" | "cold"; factors: ScoreFactor[] }>(
    `/api/leads/${id}/score`,
    { method: "POST" }
  );
}

export function revokeConsent(id: string): Promise<Lead> {
  return api<Lead>(`/api/leads/${id}/consent-revoke`, { method: "PATCH" });
}

export function deleteLead(id: string): Promise<{ deleted: boolean; anonymized: boolean }> {
  return api<{ deleted: boolean; anonymized: boolean }>(`/api/leads/${id}`, { method: "DELETE" });
}

/** CRM-109: Send email/WhatsApp/SMS from lead card with optional template */
export function sendMessage(
  leadId: string,
  input: {
    channel: "email" | "whatsapp" | "sms";
    templateId?: string | null;
    subject?: string | null;
    body: string;
  }
): Promise<LeadInteraction> {
  return api<LeadInteraction>(`/api/leads/${leadId}/send-message`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** CRM-109: Log a phone call with outcome + duration + note */
export function logCall(
  leadId: string,
  input: {
    outcome: "interested" | "not_interested" | "wrong_number" | "no_answer";
    durationSeconds?: number | null;
    note?: string | null;
  }
): Promise<LeadInteraction> {
  return api<LeadInteraction>(`/api/leads/${leadId}/log-call`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── CRM-114: Lead contacts ───────────────────────────────────────────────────

export interface LeadContact {
  id: string;
  tenantId: string;
  leadId: string;
  fullName: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: number; // 0 or 1
  createdAt: string;
  updatedAt: string;
}

export function listContacts(leadId: string): Promise<{ items: LeadContact[] }> {
  return api<{ items: LeadContact[] }>(`/api/leads/${leadId}/contacts`);
}

export function createContact(
  leadId: string,
  input: { fullName: string; role?: string | null; phone?: string | null; email?: string | null; isPrimary?: boolean }
): Promise<LeadContact> {
  return api<LeadContact>(`/api/leads/${leadId}/contacts`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateContact(
  leadId: string,
  contactId: string,
  patch: { fullName?: string; role?: string | null; phone?: string | null; email?: string | null; isPrimary?: boolean }
): Promise<LeadContact> {
  return api<LeadContact>(`/api/leads/${leadId}/contacts/${contactId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteContact(leadId: string, contactId: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(`/api/leads/${leadId}/contacts/${contactId}`, { method: "DELETE" });
}

// ─── CRM-115: Tags ────────────────────────────────────────────────────────────

export function listTags(leadId: string): Promise<{ tags: string[] }> {
  return api<{ tags: string[] }>(`/api/leads/${leadId}/tags`);
}

export function addTag(leadId: string, tag: string): Promise<{ tag: string }> {
  return api<{ tag: string }>(`/api/leads/${leadId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tag }),
  });
}

export function removeTag(leadId: string, tag: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(`/api/leads/${leadId}/tags/${encodeURIComponent(tag)}`, { method: "DELETE" });
}

// ─── CRM-115: Custom fields (settings) ───────────────────────────────────────

export interface CustomField {
  id: string;
  tenantId: string;
  key: string;
  label: string;
  type: "text" | "select" | "number";
  options: string[] | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export function listCustomFields(): Promise<{ fields: CustomField[] }> {
  return api<{ fields: CustomField[] }>("/api/settings/custom-fields");
}

export function createCustomField(
  input: { key: string; label: string; type?: "text" | "select" | "number"; options?: string[] | null; orderIndex?: number }
): Promise<CustomField> {
  return api<CustomField>("/api/settings/custom-fields", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCustomField(
  id: string,
  patch: { label?: string; type?: "text" | "select" | "number"; options?: string[] | null; orderIndex?: number }
): Promise<CustomField> {
  return api<CustomField>(`/api/settings/custom-fields/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteCustomField(id: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(`/api/settings/custom-fields/${id}`, { method: "DELETE" });
}

// ─── CRM-115: Lead field values ───────────────────────────────────────────────

export interface LeadFieldValue {
  id: string;
  leadId: string;
  fieldId: string;
  value: string | null;
}

export function listFieldValues(leadId: string): Promise<{ values: LeadFieldValue[]; fields: CustomField[] }> {
  return api<{ values: LeadFieldValue[]; fields: CustomField[] }>(`/api/leads/${leadId}/field-values`);
}

export function upsertFieldValue(
  leadId: string,
  input: { fieldId: string; value: string | null }
): Promise<LeadFieldValue> {
  return api<LeadFieldValue>(`/api/leads/${leadId}/field-values`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── CRM-118: Bulk actions ────────────────────────────────────────────────────

export interface BulkActionResult {
  processed: number;
  failed: number;
  errors?: string[];
}

export function bulkAction(input: {
  ids: string[];
  action: "stage" | "assign" | "tag" | "delete";
  payload?: {
    stage?: string;
    lostReason?: string | null;
    assignedTo?: string | null;
    tag?: string;
  };
}): Promise<BulkActionResult> {
  return api<BulkActionResult>("/api/leads/bulk-action", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── CRM-133: Duplicate detection banner ─────────────────────────────────────

/**
 * GET /api/leads/dedup-banner?phone=&email=&excludeId=
 * Returns potential duplicate leads for the given phone/email,
 * excluding the lead with `excludeId`.
 */
export function getDedupBanner(params: {
  phone?: string | null;
  email?: string | null;
  excludeId?: string;
}): Promise<{ duplicates: Lead[] }> {
  const query = new URLSearchParams();
  if (params.phone) query.set("phone", params.phone);
  if (params.email) query.set("email", params.email);
  if (params.excludeId) query.set("excludeId", params.excludeId);
  return api<{ duplicates: Lead[] }>(`/api/leads/dedup-banner?${query.toString()}`);
}

/**
 * POST /api/leads/:id/merge
 * Merges two leads. Copies interactions + tasks from the archived lead to the kept one.
 * The archived lead is marked stage=lost, lostReason="merged".
 */
export function mergeLead(
  leadId: string,
  input: { mergeWithId: string; keepId: string }
): Promise<{ merged: boolean; keptLead: Lead }> {
  return api<{ merged: boolean; keptLead: Lead }>(`/api/leads/${leadId}/merge`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
