/**
 * PAR-105: Client-side API helpers for the PAR (Payment Action Request) module
 * Covers: create/get/patch/submit, line items, attachments, config lookups
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ParPurpose = "execute_payment" | "obtain_quotations" | "provide_estimate";
export type ParChargeTo = "operations" | "program" | "other";
export type ParStatus =
  | "draft"
  | "pending_approval"
  | "changes_requested"
  | "rejected"
  | "approved"
  | "in_finance"
  | "reapproval_required"
  | "paid"
  | "cancelled";

export type ParAttachmentKind =
  | "act_of_receipt"
  | "contract"
  | "quotation"
  | "invoice"
  | "par_pdf"
  | "other";

export interface ParRequest {
  id: string;
  tenantId: string;
  requestNo: string;
  dateOfRequest: string;
  requestedByUserId: string;
  requestorTitle: string | null;
  departmentId: string | null;
  dateNeeded: string | null;
  projectId: string | null;
  budgetCodeId: string | null;
  budgetCodeNote: string | null;
  purpose: ParPurpose;
  chargeTo: ParChargeTo;
  chargeBillingCode: string | null;
  endUse: string | null;
  vendorId: string | null;
  payeeName: string | null;
  payeeIdnp: string | null;
  payeeIban: string | null;
  payeeBank: string | null;
  attachmentsPresent: boolean;
  attachmentsNote: string | null;
  currency: string;
  totalEstimatedCents: number;
  above_micro_threshold?: boolean;
  status: ParStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ParLineItem {
  id: string;
  tenantId: string;
  parId: string;
  position: number;
  description: string;
  quantity: number;
  unit: string | null;
  unitPriceCents: number;
  lineTotalCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface ParAttachment {
  id: string;
  fileName: string;
  kind: ParAttachmentKind;
  uploadedBy: string | null;
  createdAt: string;
  fileUrl: string;
}

export interface ParDetail extends ParRequest {
  line_items: ParLineItem[];
  approvals: ParApproval[];
  attachments: ParAttachment[];
  payment: ParPayment | null;
}

export interface ParApproval {
  id: string;
  step: number;
  approverUserId: string | null;
  approverRoleLabel: string | null;
  decision: "pending" | "approved" | "rejected" | "changes_requested";
  /** PAR-107/109: true = step locked (prior step not yet approved) */
  locked: boolean;
  decidedAt: string | null;
  comment: string | null;
  signatureName: string | null;
  signatureTitle: string | null;
  createdAt: string;
}

/** PAR-108: inbox item (PAR + active step info) */
export interface ParInboxItem extends ParRequest {
  my_step: number | null;
  my_step_label: string | null;
}

export interface ParPayment {
  id: string;
  parBl: string | null;
  receivedAt: string | null;
  actualAmountCents: number | null;
  paymentDate: string | null;
  paymentRef: string | null;
}

// Config entities
export interface ParDepartment { id: string; name: string; active: boolean; }
export interface ParProject { id: string; name: string; donor: string | null; active: boolean; }
export interface ParBudgetCode { id: string; code: string; name: string; active: boolean; }
export interface ParVendor { id: string; name: string; idnp: string | null; iban: string | null; bank: string | null; active: boolean; }

// ─── PAR CRUD ─────────────────────────────────────────────────────────────────

export interface CreateParPayload {
  date_of_request?: string;
  requestor_title?: string | null;
  department_id?: string | null;
  date_needed?: string | null;
  project_id?: string | null;
  budget_code_id?: string | null;
  budget_code_note?: string | null;
  purpose?: ParPurpose;
  charge_to?: ParChargeTo;
  charge_billing_code?: string | null;
}

export interface UpdateParPayload extends CreateParPayload {
  end_use?: string | null;
  vendor_id?: string | null;
  payee_name?: string | null;
  payee_idnp?: string | null;
  payee_iban?: string | null;
  payee_bank?: string | null;
  attachments_present?: boolean;
  attachments_note?: string | null;
}

export async function createPar(payload: CreateParPayload): Promise<ParRequest> {
  return api<ParRequest>("/api/par", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPar(id: string): Promise<ParDetail> {
  return api<ParDetail>(`/api/par/${id}`);
}

export async function updatePar(id: string, payload: UpdateParPayload): Promise<ParRequest> {
  return api<ParRequest>(`/api/par/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export interface ListParFilters {
  status?: ParStatus;
  purpose?: ParPurpose;
  project_id?: string;
  q?: string;
}

export async function listPar(filters: ListParFilters = {}): Promise<{
  requests: (ParRequest & { above_micro_threshold: boolean })[];
  total: number;
}> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.purpose) params.set("purpose", filters.purpose);
  if (filters.project_id) params.set("project_id", filters.project_id);
  if (filters.q) params.set("q", filters.q);
  const qs = params.toString();
  return api(`/api/par${qs ? `?${qs}` : ""}`);
}

/** Submit a PAR (transition from draft → pending_approval, PAR-107) */
export async function submitPar(id: string): Promise<ParRequest> {
  return api<ParRequest>(`/api/par/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ─── PAR-108: Approver inbox + decisions ─────────────────────────────────────

/** Get PARs awaiting the current user's approval decision */
export async function getParInbox(): Promise<{ inbox: ParInboxItem[]; total: number }> {
  return api<{ inbox: ParInboxItem[]; total: number }>("/api/par/inbox");
}

export interface ApprovePayload {
  comment?: string | null;
  signatureName?: string | null;
}

export interface RejectPayload {
  comment: string;
  signatureName?: string | null;
}

export interface RequestChangesPayload {
  comment: string;
}

/** Approve the active step for a PAR */
export async function approvePar(id: string, payload: ApprovePayload = {}): Promise<ParRequest> {
  return api<ParRequest>(`/api/par/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Reject a PAR (terminal) */
export async function rejectPar(id: string, payload: RejectPayload): Promise<ParRequest> {
  return api<ParRequest>(`/api/par/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Request changes on a PAR (sends back to requestor) */
export async function requestParChanges(id: string, payload: RequestChangesPayload): Promise<ParRequest> {
  return api<ParRequest>(`/api/par/${id}/request-changes`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Line items ───────────────────────────────────────────────────────────────

export interface LineItemPayload {
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price_cents: number;
}

export async function addLineItem(
  parId: string,
  payload: LineItemPayload
): Promise<{ line_item: ParLineItem; par_total_estimated_cents: number; above_micro_threshold: boolean }> {
  return api(`/api/par/${parId}/line-items`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateLineItem(
  parId: string,
  lineId: string,
  payload: Partial<LineItemPayload>
): Promise<{ line_item: ParLineItem; par_total_estimated_cents: number; above_micro_threshold: boolean }> {
  return api(`/api/par/${parId}/line-items/${lineId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteLineItem(
  parId: string,
  lineId: string
): Promise<{ ok: boolean; par_total_estimated_cents: number; above_micro_threshold: boolean }> {
  return api(`/api/par/${parId}/line-items/${lineId}`, { method: "DELETE" });
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export interface UploadAttachmentPayload {
  file_name: string;
  file_url: string; // base64 data URL
  mime: string;
  kind?: ParAttachmentKind;
  size_bytes?: number;
}

export async function uploadAttachment(
  parId: string,
  payload: UploadAttachmentPayload
): Promise<ParAttachment> {
  return api<ParAttachment>(`/api/par/${parId}/attachments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listAttachments(parId: string): Promise<{ items: ParAttachment[] }> {
  return api(`/api/par/${parId}/attachments`);
}

export async function deleteAttachment(parId: string, attId: string): Promise<{ deleted: boolean }> {
  return api(`/api/par/${parId}/attachments/${attId}`, { method: "DELETE" });
}

// ─── PAR-110: Timeline / audit log ───────────────────────────────────────────

export interface ParTimelineEvent {
  id: string;
  event: string;
  detail: string | null;
  diff: string | null;
  actor_user_id: string | null;
  actor_name: string;
  created_at: string;
}

export async function getParTimeline(parId: string): Promise<{ timeline: ParTimelineEvent[]; total: number }> {
  return api(`/api/par/${parId}/timeline`);
}

// ─── Config lookups ───────────────────────────────────────────────────────────

export async function listDepartments(): Promise<{ items: ParDepartment[] }> {
  return api("/api/par/departments");
}

export async function listProjects(): Promise<{ items: ParProject[] }> {
  return api("/api/par/projects");
}

export async function listBudgetCodes(): Promise<{ items: ParBudgetCode[] }> {
  return api("/api/par/budget-codes");
}

export async function listVendors(): Promise<{ items: ParVendor[] }> {
  return api("/api/par/vendors");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format cents as MDL currency string, e.g. 700000 → "7.000,00 MDL" */
export function formatMDL(cents: number): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency: "MDL",
    minimumFractionDigits: 2,
  }).format(amount);
}

/** PAR status colors — semantic tokens only */
export const PAR_STATUS_COLORS: Record<ParStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  changes_requested: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  rejected: "bg-destructive/10 text-destructive",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  in_finance: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  reapproval_required: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  cancelled: "bg-muted text-muted-foreground",
};

export const PAR_STATUS_LABELS: Record<ParStatus, string> = {
  draft: "Ciornă",
  pending_approval: "În aprobare",
  changes_requested: "Modificări solicitate",
  rejected: "Respinsă",
  approved: "Aprobată",
  in_finance: "La finanțe",
  reapproval_required: "Reaprobată necesară",
  paid: "Plătită",
  cancelled: "Anulată",
};
