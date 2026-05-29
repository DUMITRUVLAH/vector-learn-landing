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
  tenantId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  interestCourse: string | null;
  stage: LeadStage;
  source: LeadSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  fbclid: string | null;
  gclid: string | null;
  consentText: string | null;
  consentAt: string | null;
  ipAtConsent: string | null;
  userAgentAtConsent: string | null;
  consentRevokedAt: string | null;
  notes: string | null;
  convertedToStudentId: string | null;
  convertedAt: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadInteraction {
  id: string;
  leadId: string;
  type: "note" | "call" | "email" | "whatsapp" | "sms" | "meeting" | "stage_change" | "system";
  direction: "inbound" | "outbound" | "internal";
  body: string | null;
  userId: string | null;
  occurredAt: string;
}

export interface PipelineResponse {
  grouped: Record<LeadStage, Lead[]>;
  counts: Record<LeadStage, number>;
}

export function fetchPipeline(): Promise<PipelineResponse> {
  return api<PipelineResponse>("/api/leads/pipeline");
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
}): Promise<Lead> {
  return api<Lead>("/api/leads", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function moveLeadStage(
  id: string,
  stage: LeadStage,
  lostReason?: string
): Promise<Lead> {
  return api<Lead>(`/api/leads/${id}/stage`, {
    method: "PATCH",
    body: JSON.stringify({ stage, lostReason: lostReason ?? null }),
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

export function convertLead(id: string): Promise<{ lead: Lead; student: { id: string; fullName: string } }> {
  return api<{ lead: Lead; student: { id: string; fullName: string } }>(
    `/api/leads/${id}/convert`,
    { method: "POST" }
  );
}

export interface IntakeInput {
  tenantSlug: string;
  fullName: string;
  phone?: string | null;
  email?: string | null;
  interestCourse?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  consentText: string;
  consentAt?: string;
  captchaToken?: string | null;
}

export interface IntakeResponse {
  leadId: string;
  isDuplicate: boolean;
  interactionId?: string;
}

export function submitIntake(input: IntakeInput): Promise<IntakeResponse> {
  return api<IntakeResponse>("/api/leads/intake", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Update lead fields (phone, email, consent revoke, etc.) */
export function updateLead(
  id: string,
  patch: Partial<Pick<Lead, "fullName" | "phone" | "email" | "interestCourse" | "notes">>
): Promise<Lead> {
  return api<Lead>(`/api/leads/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}
