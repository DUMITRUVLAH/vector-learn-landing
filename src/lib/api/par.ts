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
  // VF-203: FX snapshot captured at submit (null for MDL / pre-submit).
  exchangeRate?: string | null;
  totalMdlCents?: number | null;
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
  /** Resolved display names for the PDF/print form (UUIDs stay in the *Id fields). */
  requestedByName?: string | null;
  departmentName?: string | null;
  projectName?: string | null;
  budgetCodeLabel?: string | null;
  receivedByName?: string | null;
  assignedToName?: string | null;
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
  receivedByUserId: string | null;
  assignedToUserId: string | null;
  actualAmountCents: number | null;
  paymentDate: string | null;
  paymentRef: string | null;
  proofUrl?: string | null;
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
  currency?: "MDL" | "EUR" | "USD" | "RON";
}

export async function createPar(payload: CreateParPayload): Promise<ParRequest> {
  return api<ParRequest>("/api/par", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** VF-103: duplicate a PAR into a fresh draft owned by the current user. */
export async function duplicatePar(id: string): Promise<{ par: ParRequest }> {
  return api<{ par: ParRequest }>(`/api/par/${id}/duplicate`, { method: "POST" });
}

// VF-104: comments
export interface ParComment {
  id: string;
  body: string;
  authorUserId: string;
  authorName: string | null;
  createdAt: string;
}

// VF-501: quotes (RFQ)
export interface ParQuote {
  id: string;
  parId: string;
  vendorId: string | null;
  vendorName: string;
  totalCents: number;
  currency: string;
  validUntil: string | null;
  notes: string | null;
  fileUrl: string | null;
  selected: boolean;
  selectionReason: string | null;
  createdAt: string;
}

/** VF-502: mark a quote as the winning choice with a justification. */
export async function selectParQuote(parId: string, quoteId: string, reason: string): Promise<{ ok: boolean }> {
  return api(`/api/par/${parId}/quotes/${quoteId}/select`, { method: "POST", body: JSON.stringify({ reason }) });
}

// VF-503: purchase order
export interface ParPurchaseOrder {
  id: string;
  parId: string;
  poNumber: string;
  vendorName: string | null;
  vendorIdnp: string | null;
  vendorIban: string | null;
  totalCents: number;
  currency: string;
  status: string;
  issuedAt: string;
}

export async function getPurchaseOrder(parId: string): Promise<ParPurchaseOrder> {
  return api(`/api/par/${parId}/purchase-order`);
}

export async function issuePurchaseOrder(parId: string): Promise<ParPurchaseOrder> {
  return api(`/api/par/${parId}/purchase-order`, { method: "POST" });
}

// VF-504: goods receipt
export interface ParReceiptLine { id: string; lineItemId: string; qtyReceived: number }
export interface ParReceipt {
  id: string;
  parId: string;
  receivedAt: string;
  complete: boolean;
  notes: string | null;
  lines: ParReceiptLine[];
}

export async function listParReceipts(parId: string): Promise<{ receipts: ParReceipt[] }> {
  return api(`/api/par/${parId}/receipts`);
}

export async function addParReceipt(parId: string, payload: {
  complete: boolean;
  notes?: string | null;
  lines: { line_item_id: string; qty_received: number }[];
}): Promise<ParReceipt> {
  return api(`/api/par/${parId}/receipts`, { method: "POST", body: JSON.stringify(payload) });
}

// VF-505: 3-way match
export interface ThreeWayMatch {
  poExists: boolean;
  fullyReceived: boolean;
  amountMatches: boolean;
  ok: boolean;
  issues: string[];
}

export async function getThreeWayMatch(parId: string): Promise<ThreeWayMatch> {
  return api(`/api/par/${parId}/match`);
}

export async function listParQuotes(parId: string): Promise<{ quotes: ParQuote[] }> {
  return api(`/api/par/${parId}/quotes`);
}

export async function addParQuote(parId: string, payload: {
  vendor_id?: string | null;
  vendor_name?: string | null;
  total_cents: number;
  currency?: "MDL" | "EUR" | "USD" | "RON";
  valid_until?: string | null;
  notes?: string | null;
}): Promise<ParQuote> {
  return api(`/api/par/${parId}/quotes`, { method: "POST", body: JSON.stringify(payload) });
}

export async function deleteParQuote(parId: string, quoteId: string): Promise<{ ok: boolean }> {
  return api(`/api/par/${parId}/quotes/${quoteId}`, { method: "DELETE" });
}

export async function listParComments(parId: string): Promise<{ comments: ParComment[] }> {
  return api(`/api/par/${parId}/comments`);
}

export async function addParComment(parId: string, body: string): Promise<ParComment> {
  return api(`/api/par/${parId}/comments`, { method: "POST", body: JSON.stringify({ body }) });
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
  // VF-105: date range (ISO yyyy-mm-dd) + total range (cents)
  date_from?: string;
  date_to?: string;
  min_total?: number;
  max_total?: number;
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
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.min_total != null) params.set("min_total", String(filters.min_total));
  if (filters.max_total != null) params.set("max_total", String(filters.max_total));
  const qs = params.toString();
  return api(`/api/par${qs ? `?${qs}` : ""}`);
}

/** Submit a PAR (transition from draft → pending_approval, PAR-107) */
// VF-202: submit may include an advisory over-budget signal.
export interface OverBudgetInfo {
  over: boolean;
  overByCents: number;
  allocatedCents: number;
  usedCents: number;
}

export async function submitPar(id: string): Promise<ParRequest & { over_budget?: OverBudgetInfo | null }> {
  return api<ParRequest & { over_budget?: OverBudgetInfo | null }>(`/api/par/${id}/submit`, {
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

// VF-102: bulk approve
export interface BulkApproveResultItem {
  id: string;
  ok: boolean;
  status?: string;
  error?: string;
}

export async function bulkApprovePar(payload: {
  par_ids: string[];
  comment?: string | null;
  signatureName?: string | null;
}): Promise<{ results: BulkApproveResultItem[]; approved: number; failed: number }> {
  return api("/api/par/bulk-approve", { method: "POST", body: JSON.stringify(payload) });
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

// ─── PAR-112/113: Finance queue + section 16 + payment execution ─────────────

export interface ParPaymentRecord {
  id: string;
  tenantId: string;
  parId: string;
  parBl: string | null;
  receivedAt: string | null;
  receivedByUserId: string | null;
  assignedToUserId: string | null;
  actualAmountCents: number | null;
  paymentDate: string | null;
  paymentRef: string | null;
  proofUrl: string | null;
  overageReapproved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ParFinanceQueueItem extends ParRequest {
  above_micro_threshold: boolean;
  payment: ParPaymentRecord | null;
}

export async function getFinanceQueue(): Promise<{ items: ParFinanceQueueItem[]; total: number }> {
  return api("/api/par/finance");
}

export interface Section16Payload {
  par_bl?: string | null;
  received_by_user_id?: string | null;
  assigned_to_user_id?: string | null;
}

export async function submitSection16(
  parId: string,
  payload: Section16Payload
): Promise<{ par: ParRequest; payment: ParPaymentRecord }> {
  return api(`/api/par/${parId}/finance`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface PayPayload {
  actual_amount_cents: number;
  payment_date: string; // ISO date or datetime
  payment_ref: string;
  proof_url?: string | null;
}

export async function executePayment(
  parId: string,
  payload: PayPayload
): Promise<{ status: "paid" | "reapproval_required"; par: ParRequest; message?: string }> {
  return api(`/api/par/${parId}/pay`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function reapproveOverage(
  parId: string
): Promise<{ status: string; overage_reapproved: boolean; par: ParRequest }> {
  return api(`/api/par/${parId}/reapprove`, { method: "POST", body: JSON.stringify({}) });
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
  return api<{ items?: ParDepartment[]; departments?: ParDepartment[] }>("/api/par/departments")
    .then((r) => ({ items: (r as { items?: ParDepartment[]; departments?: ParDepartment[] }).items ?? (r as { items?: ParDepartment[]; departments?: ParDepartment[] }).departments ?? [] }));
}

export async function listProjects(): Promise<{ items: ParProject[] }> {
  return api<{ items?: ParProject[]; projects?: ParProject[] }>("/api/par/projects")
    .then((r) => ({ items: (r as { items?: ParProject[]; projects?: ParProject[] }).items ?? (r as { items?: ParProject[]; projects?: ParProject[] }).projects ?? [] }));
}

export async function listBudgetCodes(): Promise<{ items: ParBudgetCode[] }> {
  return api<{ items?: ParBudgetCode[]; budgetCodes?: ParBudgetCode[] }>("/api/par/budget-codes")
    .then((r) => ({ items: (r as { items?: ParBudgetCode[]; budgetCodes?: ParBudgetCode[] }).items ?? (r as { items?: ParBudgetCode[]; budgetCodes?: ParBudgetCode[] }).budgetCodes ?? [] }));
}

export async function listVendors(): Promise<{ items: ParVendor[] }> {
  return api<{ items?: ParVendor[]; vendors?: ParVendor[] }>("/api/par/vendors")
    .then((r) => ({ items: (r as { items?: ParVendor[]; vendors?: ParVendor[] }).items ?? (r as { items?: ParVendor[]; vendors?: ParVendor[] }).vendors ?? [] }));
}

// ─── PAR me — current user's PAR roles ───────────────────────────────────────

export async function getParMe(): Promise<{ roles: string[]; userId: string; tenantId: string }> {
  return api("/api/par/me");
}

// ─── PAR-FIN-001: bridge PAR → FinDesk draft invoice ─────────────────────────

export interface ParToInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  partyId: string;
}

/**
 * Generate a FinDesk draft invoice from an approved PAR. The beneficiary becomes
 * a supplier party and the total + end_use become a single invoice line. Returns
 * the new invoice id so the UI can deep-link to it (where e-Factura submit lives).
 */
export async function parToInvoice(parId: string): Promise<ParToInvoiceResult> {
  return api(`/api/par/${parId}/to-invoice`, { method: "POST", body: JSON.stringify({}) });
}

// ─── PAR-116: Admin — DOA, Settings, Members, Reference data ─────────────────

export interface ParDoaRow {
  id: string;
  tenantId: string;
  chargeTo: "operations" | "program" | "other" | null;
  departmentId: string | null;
  minAmountCents: number;
  maxAmountCents: number | null;
  step: number;
  approverRoleLabel: string;
  approverUserId: string | null;
  approverParRole: "requestor" | "approver" | "finance" | "par_admin" | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ParSettings {
  id?: string;
  tenantId?: string;
  microPurchaseThresholdCents: number;
  defaultCurrency: string;
  orgLegalName: string | null;
  orgLogoUrl: string | null;
  pdfHelpUrl: string | null;
  requestNoPrefix: string;
  onboardingComplete?: boolean;
  enforceThreeWayMatch?: boolean;
}

export interface ParMember {
  id: string;
  userId: string;
  role: "requestor" | "approver" | "finance" | "par_admin";
  approvalLimitCents: number | null;
  createdAt: string;
  userName?: string;
  userEmail?: string;
}

export async function listParDoaMatrix(): Promise<{ rows: ParDoaRow[] }> {
  return api("/api/par/doa");
}

export async function createParDoaRow(payload: Omit<ParDoaRow, "id" | "tenantId" | "createdAt" | "updatedAt">): Promise<ParDoaRow> {
  return api("/api/par/doa", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateParDoaRow(id: string, payload: Partial<Omit<ParDoaRow, "id" | "tenantId" | "createdAt" | "updatedAt">>): Promise<ParDoaRow> {
  return api(`/api/par/doa/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteParDoaRow(id: string): Promise<{ ok: boolean }> {
  return api(`/api/par/doa/${id}`, { method: "DELETE" });
}

export async function getParSettings(): Promise<ParSettings> {
  return api("/api/par/settings");
}

export async function updateParSettings(payload: Partial<Omit<ParSettings, "id" | "tenantId">>): Promise<ParSettings> {
  return api("/api/par/settings", { method: "PATCH", body: JSON.stringify(payload) });
}

export async function listParMembers(): Promise<{ members: ParMember[] }> {
  return api("/api/par/members");
}

export async function assignParMember(payload: {
  userId: string;
  role: "requestor" | "approver" | "finance" | "par_admin";
  approvalLimitCents?: number | null;
}): Promise<ParMember> {
  return api("/api/par/members", { method: "POST", body: JSON.stringify(payload) });
}

export async function revokeParMember(id: string): Promise<{ ok: boolean }> {
  return api(`/api/par/members/${id}`, { method: "DELETE" });
}

// VF-004: invitations
export type ParRole = "requestor" | "approver" | "finance" | "par_admin";

export interface ParInvite {
  id: string;
  email: string;
  parRole: ParRole;
  expiresAt: string;
  createdAt: string;
}

export async function listParInvites(): Promise<{ invites: ParInvite[] }> {
  return api("/api/par/invites");
}

export async function createParInvite(payload: { email: string; par_role: ParRole }): Promise<{
  id: string; email: string; parRole: ParRole; inviteUrl: string; emailed: boolean;
}> {
  return api("/api/par/invites", { method: "POST", body: JSON.stringify(payload) });
}

export async function revokeParInvite(id: string): Promise<{ ok: boolean }> {
  return api(`/api/par/invites/${id}`, { method: "DELETE" });
}

export interface InviteInfo { email: string; parRole: ParRole; orgName: string }

export async function getInviteInfo(token: string): Promise<InviteInfo> {
  return api(`/api/auth/invite-info?token=${encodeURIComponent(token)}`);
}

export async function acceptInvite(payload: { token: string; name: string; password: string }): Promise<{
  user: { id: string; email: string; name: string; role: string };
}> {
  return api("/api/auth/accept-invite", { method: "POST", body: JSON.stringify(payload) });
}

// Reference data CRUD — departments, projects, budget codes, vendors

export async function createDepartment(payload: { name: string }): Promise<ParDepartment> {
  return api("/api/par/departments", { method: "POST", body: JSON.stringify(payload) });
}
export async function updateDepartment(id: string, payload: Partial<{ name: string; active: boolean }>): Promise<ParDepartment> {
  return api(`/api/par/departments/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export async function deleteDepartment(id: string): Promise<{ ok: boolean }> {
  return api(`/api/par/departments/${id}`, { method: "DELETE" });
}

export async function createProject(payload: { name: string; donor?: string | null }): Promise<ParProject> {
  return api("/api/par/projects", { method: "POST", body: JSON.stringify(payload) });
}
export async function updateProject(id: string, payload: Partial<{ name: string; donor?: string | null; active: boolean }>): Promise<ParProject> {
  return api(`/api/par/projects/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export async function deleteProject(id: string): Promise<{ ok: boolean }> {
  return api(`/api/par/projects/${id}`, { method: "DELETE" });
}

export async function createBudgetCode(payload: { code: string; name: string }): Promise<ParBudgetCode> {
  return api("/api/par/budget-codes", { method: "POST", body: JSON.stringify(payload) });
}
export async function updateBudgetCode(id: string, payload: Partial<{ code: string; name: string; active: boolean }>): Promise<ParBudgetCode> {
  return api(`/api/par/budget-codes/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export async function deleteBudgetCode(id: string): Promise<{ ok: boolean }> {
  return api(`/api/par/budget-codes/${id}`, { method: "DELETE" });
}

export async function createVendor(payload: { name: string; idnp?: string | null; iban?: string | null; bank?: string | null }): Promise<ParVendor> {
  return api("/api/par/vendors", { method: "POST", body: JSON.stringify(payload) });
}
export async function updateVendor(id: string, payload: Partial<{ name: string; idnp?: string | null; iban?: string | null; bank?: string | null; active: boolean }>): Promise<ParVendor> {
  return api(`/api/par/vendors/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}
export async function deleteVendor(id: string): Promise<{ ok: boolean }> {
  return api(`/api/par/vendors/${id}`, { method: "DELETE" });
}

// ─── PAR-117: Reports ─────────────────────────────────────────────────────────

export interface ParReportFilters {
  period_from?: string;  // ISO date
  period_to?: string;    // ISO date
}

export interface ParSpendByItem {
  label: string;       // budget code / department / project name
  id: string | null;
  totalCents: number;
  count: number;
}

export interface ParAgingItem {
  status: string;
  count: number;
  avgAgingDays: number;
  totalCents: number;
}

export interface ParCycleTimeItem {
  avgSubmitToApprovedDays: number | null;
  avgSubmitToPaidDays: number | null;
  count: number;
}

export async function getParReportByBudget(filters?: ParReportFilters): Promise<{ items: ParSpendByItem[] }> {
  const params = new URLSearchParams();
  if (filters?.period_from) params.set("from", filters.period_from);
  if (filters?.period_to) params.set("to", filters.period_to);
  const qs = params.toString();
  return api(`/api/par/reports/by-budget${qs ? `?${qs}` : ""}`);
}

// VF-302: delegations
export interface ParDelegation {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName: string | null;
  toName: string | null;
  startsAt: string;
  endsAt: string;
  active: boolean;
  createdAt: string;
}

export async function listParDelegations(): Promise<{ delegations: ParDelegation[] }> {
  return api("/api/par/delegations");
}

export async function createParDelegation(payload: {
  to_user_id: string;
  starts_at: string;
  ends_at: string;
}): Promise<ParDelegation> {
  return api("/api/par/delegations", { method: "POST", body: JSON.stringify(payload) });
}

export async function cancelParDelegation(id: string): Promise<{ ok: boolean }> {
  return api(`/api/par/delegations/${id}`, { method: "DELETE" });
}

// VF-301: audit log
export interface ParAuditEntry {
  id: string;
  event: string;
  detail: string | null;
  createdAt: string;
  actorUserId: string | null;
  actorName: string | null;
  parId: string;
  requestNo: string | null;
}

export interface ParAuditFilters {
  par_id?: string;
  actor_user_id?: string;
  event?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
}

export async function getParAudit(filters: ParAuditFilters = {}): Promise<{
  entries: ParAuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const params = new URLSearchParams();
  if (filters.par_id) params.set("par_id", filters.par_id);
  if (filters.actor_user_id) params.set("actor_user_id", filters.actor_user_id);
  if (filters.event) params.set("event", filters.event);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.page) params.set("page", String(filters.page));
  const qs = params.toString();
  return api(`/api/par/audit${qs ? `?${qs}` : ""}`);
}

export async function getParReportByDepartment(filters?: ParReportFilters): Promise<{ items: ParSpendByItem[] }> {
  const params = new URLSearchParams();
  if (filters?.period_from) params.set("from", filters.period_from);
  if (filters?.period_to) params.set("to", filters.period_to);
  const qs = params.toString();
  return api(`/api/par/reports/by-department${qs ? `?${qs}` : ""}`);
}

export async function getParReportByProject(filters?: ParReportFilters): Promise<{ items: ParSpendByItem[] }> {
  const params = new URLSearchParams();
  if (filters?.period_from) params.set("from", filters.period_from);
  if (filters?.period_to) params.set("to", filters.period_to);
  const qs = params.toString();
  return api(`/api/par/reports/by-project${qs ? `?${qs}` : ""}`);
}

export async function getParReportByChargeTo(filters?: ParReportFilters): Promise<{ items: ParSpendByItem[] }> {
  const params = new URLSearchParams();
  if (filters?.period_from) params.set("from", filters.period_from);
  if (filters?.period_to) params.set("to", filters.period_to);
  const qs = params.toString();
  return api(`/api/par/reports/by-charge-to${qs ? `?${qs}` : ""}`);
}

export async function getParReportAging(): Promise<{ items: ParAgingItem[] }> {
  return api("/api/par/reports/aging");
}

export async function getParReportCycleTime(): Promise<ParCycleTimeItem> {
  return api("/api/par/reports/cycle-time");
}

export function getParReportExportUrl(filters?: ParReportFilters): string {
  const params = new URLSearchParams();
  if (filters?.period_from) params.set("from", filters.period_from);
  if (filters?.period_to) params.set("to", filters.period_to);
  const qs = params.toString();
  return `/api/par/reports/export.csv${qs ? `?${qs}` : ""}`;
}

/** VF-201: same filters, Excel workbook. */
export function getParReportExportXlsxUrl(filters?: ParReportFilters): string {
  const params = new URLSearchParams();
  if (filters?.period_from) params.set("from", filters.period_from);
  if (filters?.period_to) params.set("to", filters.period_to);
  const qs = params.toString();
  return `/api/par/reports/export.xlsx${qs ? `?${qs}` : ""}`;
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

// ─── Feature 1: Contafirm.md company registry ─────────────────────────────────

export interface RegistryCompany {
  id: number;
  idno: string | null;
  name: string;
  status: string;
  legalForm: string | null;
  registrationDate: string | null;
  liquidationDate: string | null;
  cuatmCode: string | null;
  address: string | null;
  city: string | null;
}

export interface RegistryCompanyDetail extends RegistryCompany {
  activities: { licensed: string[]; unlicensed: string[] };
  contacts: {
    websiteUrl: string | null;
    emails: string[];
    phones: string[];
    socialLinks: string[];
  };
}

/**
 * Search active companies by name or IDNO.
 * Returns only active (non-liquidated) companies.
 */
export async function searchRegistryCompanies(
  q: string,
  perPage = 10
): Promise<RegistryCompany[]> {
  if (q.trim().length < 2) return [];
  const params = new URLSearchParams({ q: q.trim(), per_page: String(perPage) });
  const result = await api<{ data: RegistryCompany[] }>(
    `/api/registry/companies?${params.toString()}`
  );
  return result.data ?? [];
}

/**
 * Get company detail by IDNO.
 * Throws if the company is liquidated (server returns 422).
 */
export async function getRegistryCompanyByIdno(
  idno: string
): Promise<RegistryCompanyDetail> {
  return api<RegistryCompanyDetail>(`/api/registry/companies/${encodeURIComponent(idno)}`);
}

// ─── Feature 2: Budget code balance ──────────────────────────────────────────

export interface BudgetCodeBalance {
  allocatedCents: number;
  committedCents: number;
  spentCents: number;
  availableCents: number;
}

/** Get balance (allocated / committed / spent / available) for a budget code */
export async function getBudgetCodeBalance(
  budgetCodeId: string
): Promise<BudgetCodeBalance> {
  return api<BudgetCodeBalance>(`/api/par/budget-codes/${budgetCodeId}/balance`);
}

// VF-202: bulk budget usage
export interface BudgetCodeUsage {
  id: string;
  code: string;
  name: string;
  allocatedCents: number;
  committedCents: number;
  paidCents: number;
  availableCents: number;
  usedCents: number;
  usedPct: number | null;
}

export async function getBudgetCodesUsage(): Promise<{ usage: BudgetCodeUsage[] }> {
  return api("/api/par/budget-codes/usage");
}

// ─── Feature 3: PAR Templates ─────────────────────────────────────────────────

export interface ParTemplateSnapshot {
  requestorTitle: string | null;
  departmentId: string | null;
  projectId: string | null;
  budgetCodeId: string | null;
  budgetCodeNote: string | null;
  purpose: string;
  chargeTo: string;
  chargeBillingCode: string | null;
  endUse: string | null;
  vendorId: string | null;
  payeeName: string | null;
  payeeIdnp: string | null;
  payeeIban: string | null;
  payeeBank: string | null;
  lineItems: Array<{
    position: number;
    description: string;
    quantity: number;
    unit: string | null;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
}

export interface ParTemplate {
  id: string;
  tenantId: string;
  name: string;
  createdByUserId: string | null;
  snapshot: ParTemplateSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

export async function listParTemplates(): Promise<{ templates: ParTemplate[] }> {
  return api("/api/par/templates");
}

export async function saveParTemplate(payload: {
  name: string;
  parId?: string;
  snapshot?: Partial<ParTemplateSnapshot> & { lineItems?: ParTemplateSnapshot["lineItems"] };
}): Promise<ParTemplate> {
  return api("/api/par/templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteParTemplate(id: string): Promise<{ ok: boolean }> {
  return api(`/api/par/templates/${id}`, { method: "DELETE" });
}

/** Instantiate a template → creates a new draft PAR and returns it with line items */
export async function instantiateParTemplate(
  id: string
): Promise<{ par: ParRequest; line_items: ParLineItem[] }> {
  return api(`/api/par/templates/${id}/instantiate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
