/**
 * CAPTURE-003: FinDesk — API client pentru fin_captures
 *
 * Endpoints:
 *   GET  /api/fin/captures/:id         — detaliu captură
 *   POST /api/fin/captures/:id/confirm — confirmă + creează cheltuiala
 *   GET  /api/fin/captures             — lista capturi (paginată)
 */
import { api, apiUpload, ApiError } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FinCaptureStatus =
  | "pending"
  | "processing"
  | "extracted"
  | "confirmed"
  | "failed";

export interface CapturedField<T = unknown> {
  value: T;
  confidence: number; // [0..1]
  low_confidence?: boolean;
  reason?: string;
}

export interface ExtractedFields {
  vendor_name?: CapturedField<string | null>;
  amount_cents?: CapturedField<number | null>;
  vat_amount_cents?: CapturedField<number | null>;
  vat_deductible?: CapturedField<boolean | null>;
  expense_date?: CapturedField<string | null>; // YYYY-MM-DD
  iban?: CapturedField<string | null>;
  category?: CapturedField<string | null>;
  reference?: CapturedField<string | null>;
  purpose?: CapturedField<string | null>;
  reportable?: CapturedField<boolean | null>;
  document_class?: CapturedField<DocumentClass | null>;
}

/** Invoice Reporting: derived reportable status. */
export type ReportableStatus = "yes" | "no" | "review";

export const REPORTABLE_LABELS: Record<ReportableStatus, string> = {
  yes: "Pentru raportare",
  no: "Neraportabil",
  review: "De verificat",
};

/** Document Classification: what kind of document the AI thinks was uploaded. */
export type DocumentClass = "invoice" | "receipt" | "not_invoice";

/** Derived document-class status (AI verdict, "review" when unsure/low-confidence). */
export type DocumentClassStatus = DocumentClass | "review";

export const DOCUMENT_CLASS_LABELS: Record<DocumentClassStatus, string> = {
  invoice: "Factură",
  receipt: "Bon / chitanță",
  not_invoice: "Nu pare factură",
  review: "De verificat",
};

/** Team Docs: which team uploaded the document (for month-end grouping). */
export type FinDocTeam =
  | "marketing"
  | "sales"
  | "it"
  | "operations"
  | "hr"
  | "finance"
  | "management"
  | "other";

export const TEAM_LABELS: Record<FinDocTeam, string> = {
  marketing: "Marketing",
  sales: "Vânzări",
  it: "IT",
  operations: "Operațiuni",
  hr: "HR",
  finance: "Finanțe",
  management: "Management",
  other: "Altele",
};

export interface FinCapture {
  id: string;
  tenantId: string;
  expenseId: string | null;
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: FinCaptureStatus;
  team: FinDocTeam;
  kind: "document" | "statement";
  extractedFields: ExtractedFields | null;
  rawText: string | null;
  errorMessage: string | null;
  // Invoice Reporting verdict + review
  reportable: ReportableStatus;
  reportableReason: string | null;
  reportableConfidenceBp: number;
  // Document Classification verdict
  documentClass: DocumentClassStatus;
  documentClassReason: string | null;
  documentClassConfidenceBp: number;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory =
  | "rent"
  | "utilities"
  | "salaries"
  | "marketing"
  | "supplies"
  | "software"
  | "maintenance"
  | "other";

export interface ConfirmCapturePayload {
  fields: {
    vendor_name?: string;
    amount_cents: number;
    vat_amount_cents?: number;
    vat_deductible: boolean;
    expense_date: string; // YYYY-MM-DD
    category?: ExpenseCategory;
    reference?: string;
    description?: string;
  };
}

export interface ConfirmCaptureResult {
  capture: FinCapture;
  expenseId: string | null;
  message: string;
}

export interface CapturesListResult {
  captures: FinCapture[];
  total: number;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getCapture(id: string): Promise<FinCapture> {
  const res = await api<{ capture: FinCapture }>(`/api/fin/captures/${id}`);
  return res.capture;
}

export async function confirmCapture(
  id: string,
  payload: ConfirmCapturePayload
): Promise<ConfirmCaptureResult> {
  return api<ConfirmCaptureResult>(`/api/fin/captures/${id}/confirm`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCaptures(
  opts: {
    page?: number;
    team?: FinDocTeam;
    month?: string;
    reportable?: ReportableStatus;
    documentClass?: DocumentClassStatus;
    /** Hide invoice/receipt documents already attributed to a statement (main list only). */
    hideMatched?: boolean;
  } = {},
): Promise<CapturesListResult> {
  const qs = new URLSearchParams({ page: String(opts.page ?? 1) });
  if (opts.team) qs.set("team", opts.team);
  if (opts.month) qs.set("month", opts.month);
  if (opts.reportable) qs.set("reportable", opts.reportable);
  if (opts.documentClass) qs.set("documentClass", opts.documentClass);
  if (opts.hideMatched) qs.set("hideMatched", "1");
  return api<CapturesListResult>(`/api/fin/captures?${qs.toString()}`);
}

/** Invoice Reporting: reviewer approves (yes) or rejects (no) the reportable verdict. */
export async function reviewCapture(
  id: string,
  decision: "yes" | "no",
  note?: string,
): Promise<{ capture: FinCapture }> {
  return api<{ capture: FinCapture }>(`/api/fin/captures/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify({ decision, note }),
  });
}

/** Invoice ↔ transaction match status for a statement line. */
export type MatchStatus = "matched" | "missing" | "review";

export const MATCH_LABELS: Record<MatchStatus, string> = {
  matched: "Are factură",
  missing: "Lipsește factura",
  review: "Neverificat",
};

/** A single transaction extracted from a bank-statement capture. */
export interface CaptureLine {
  id: string;
  captureId: string;
  txDate: string | null;
  description: string;
  counterparty: string | null;
  amountCents: number;
  direction: "in" | "out";
  currency: string;
  origAmount: string | null;
  reportable: ReportableStatus;
  reportableReason: string | null;
  reportableConfidenceBp: number;
  // Invoice ↔ transaction matching
  matchStatus: MatchStatus;
  matchedCaptureId: string | null;
  matchScoreBp: number;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface MatchResult {
  month: string | null;
  totalLines: number;
  matchedCount: number;
  missingCount: number;
  invoicePool: number;
}

/**
 * Run invoice ↔ transaction matching across statement lines. Pass `captureId` to scope the
 * match to ONE statement's transactions (Invoice Reporting page), or `month` (YYYY-MM) to
 * scope to a month. With neither, it matches every outgoing line for the tenant.
 */
export async function matchCaptures(opts: { captureId?: string; month?: string } = {}): Promise<MatchResult> {
  const qs = new URLSearchParams();
  if (opts.captureId) qs.set("captureId", opts.captureId);
  if (opts.month) qs.set("month", opts.month);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return api<MatchResult>(`/api/fin/captures/match${suffix}`, { method: "POST" });
}

/**
 * Manually link a statement line to an invoice (override), or pass `null` to mark it
 * as missing (no invoice in the system). A manual link is never overwritten by auto-match.
 */
export async function matchLineManual(
  lineId: string,
  captureId: string | null,
): Promise<{ line: CaptureLine }> {
  return api<{ line: CaptureLine }>(`/api/fin/captures/lines/${lineId}/match`, {
    method: "PATCH",
    body: JSON.stringify({ captureId }),
  });
}

/** BANK-INV-001: turn an INCOMING statement line into a FinDesk draft invoice (→ e-Factura). */
export interface LineToInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  partyId: string;
  /** True if the buyer's IDNO was found (else you fill it before e-Factura). */
  idnoFound: boolean;
}

export async function lineToInvoice(lineId: string): Promise<LineToInvoiceResult> {
  return api<LineToInvoiceResult>(`/api/fin/captures/lines/${lineId}/to-invoice`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** List the transactions extracted from a statement capture (optional reportable filter). */
export async function getCaptureLines(
  captureId: string,
  reportable?: ReportableStatus,
): Promise<{ lines: CaptureLine[]; total: number }> {
  const qs = reportable ? `?reportable=${reportable}` : "";
  return api<{ lines: CaptureLine[]; total: number }>(`/api/fin/captures/${captureId}/lines${qs}`);
}

/** Approve (yes) or reject (no) a single statement transaction line. */
export async function reviewCaptureLine(
  lineId: string,
  decision: "yes" | "no",
  note?: string,
): Promise<{ line: CaptureLine }> {
  return api<{ line: CaptureLine }>(`/api/fin/captures/lines/${lineId}/review`, {
    method: "PATCH",
    body: JSON.stringify({ decision, note }),
  });
}

/** Upload a document (JSON mode with OCR text, or pass a File via FormData). */
export async function uploadCapture(payload: {
  fileName: string;
  team: FinDocTeam;
  rawText?: string;
  mimeType?: string;
  sizeBytes?: number;
}): Promise<{ capture: FinCapture }> {
  return api<{ capture: FinCapture }>("/api/fin/captures", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Upload a single invoice/receipt file (kind="document") via multipart, so the AI
 * extracts its fields and it joins the pool matched against statement transactions.
 * Used by the bulk invoice dropzone on the Invoice Reporting page.
 */
export async function uploadInvoiceFile(
  file: File,
  team: FinDocTeam = "other",
): Promise<{ capture: FinCapture }> {
  const form = new FormData();
  form.set("team", team);
  form.set("file", file, file.name);
  // Force kind="document": these ARE invoices. Without this, a real invoice whose text
  // happens to contain date-pairs would be auto-detected as a bank statement, never enter
  // the invoice pool, and (on a scanned PDF / AI timeout) fail with "Eroare".
  form.set("kind", "document");
  form.set("forceKind", "1");
  return apiUpload<{ capture: FinCapture }>("/api/fin/captures", form);
}

/** One file's result inside a batch upload. */
export type BatchItemResult =
  | { ok: true; capture: FinCapture; lineCount: number }
  | { ok: false; fileName: string; error: string };

// ─── Direct-to-storage upload (robust path for big/real receipts) ────────────
// The file binary goes straight from the browser to Supabase Storage (NOT through the Vercel
// function), so large/real receipts no longer hit the ~4.5MB body limit or edge protections.

interface SignedUpload {
  fileName: string;
  path: string;
  signedUrl: string;
}

/** Ask the server for signed upload URLs (one per file). Tiny JSON request. */
export async function signCaptureUploads(
  files: Array<{ fileName: string }>,
): Promise<SignedUpload[]> {
  const res = await api<{ uploads: SignedUpload[] }>("/api/fin/captures/sign-uploads", {
    method: "POST",
    body: JSON.stringify({ files }),
  });
  return res.uploads;
}

/** PUT the file body straight to Supabase Storage's signed URL (bypasses our function). */
export async function putToSignedUrl(signedUrl: string, file: File): Promise<void> {
  const r = await fetch(signedUrl, {
    method: "PUT",
    headers: { "content-type": file.type || "application/octet-stream", "x-upsert": "true" },
    body: file,
  });
  if (!r.ok) throw new ApiError(r.status, `storage_put_${r.status}`);
}

/** Finalize a batch of already-uploaded objects: server downloads + extracts + creates captures. */
export async function finalizeCaptures(
  items: Array<{ path: string; fileName: string; mimeType?: string }>,
  team: FinDocTeam = "other",
): Promise<BatchUploadResult> {
  return api<BatchUploadResult>("/api/fin/captures/finalize", {
    method: "POST",
    body: JSON.stringify({ items, team, kind: "document", forceKind: true }),
  });
}

export interface BatchUploadResult {
  results: BatchItemResult[];
  count: number;
  okCount: number;
}

/**
 * Upload SEVERAL invoices in a single request. The bulk dropzone groups files into batches so
 * 50 uploads become a handful of requests — far below Vercel's per-IP firewall rate-limit, which
 * was 403-ing individual rapid uploads. Results come back in the same order as `files`.
 */
export async function uploadInvoiceBatch(
  files: File[],
  team: FinDocTeam = "other",
): Promise<BatchUploadResult> {
  const form = new FormData();
  form.set("team", team);
  form.set("kind", "document");
  form.set("forceKind", "1");
  for (const f of files) form.append("file", f, f.name);
  return apiUpload<BatchUploadResult>("/api/fin/captures/batch", form);
}

/**
 * Delete a capture. A statement also deletes its transaction lines; an invoice unlinks any
 * statement lines that pointed to it. Used to clean up duplicate uploads.
 */
export async function deleteCapture(id: string): Promise<{ ok: true; id: string; kind: string }> {
  return api<{ ok: true; id: string; kind: string }>(`/api/fin/captures/${id}`, { method: "DELETE" });
}

export interface CapturesSummary {
  month: string;
  totalDocuments: number;
  totalCents: number;
  pendingReview: number;
  reportableCounts: { yes: number; no: number; review: number };
  byTeam: Array<{ team: FinDocTeam; count: number; totalCents: number }>;
  byCategory: Array<{ category: string; count: number; totalCents: number }>;
}

export async function getCapturesSummary(month?: string): Promise<CapturesSummary> {
  const qs = month ? `?month=${month}` : "";
  return api<CapturesSummary>(`/api/fin/captures/summary${qs}`);
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/** Formatează cenți → "1.250,00 MDL" */
export function formatMDLCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const amount = cents / 100;
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency: "MDL",
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Parsează o sumă în format MDL înapoi în cenți. Returnează null dacă invalid. */
export function parseMDLToCents(value: string): number | null {
  const cleaned = value.replace(/[^\d,.]/g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  if (isNaN(num) || num < 0) return null;
  return Math.round(num * 100);
}

/** Labels pentru status captură (RO) */
export const CAPTURE_STATUS_LABELS: Record<FinCaptureStatus, string> = {
  pending: "În așteptare",
  processing: "Se procesează",
  extracted: "Extras — verificați câmpurile",
  confirmed: "Confirmat",
  failed: "Eroare extracție",
};

/** Labels pentru categorie cheltuială (RO) */
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: "Chirie",
  utilities: "Utilități",
  salaries: "Salarii",
  marketing: "Marketing",
  supplies: "Materiale",
  software: "Software",
  maintenance: "Mentenanță",
  other: "Altele",
};
