/**
 * CAPTURE-003: FinDesk — API client pentru fin_captures
 *
 * Endpoints:
 *   GET  /api/fin/captures/:id         — detaliu captură
 *   POST /api/fin/captures/:id/confirm — confirmă + creează cheltuiala
 *   GET  /api/fin/captures             — lista capturi (paginată)
 */
import { api } from "../api";

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
}

/** Invoice Reporting: derived reportable status. */
export type ReportableStatus = "yes" | "no" | "review";

export const REPORTABLE_LABELS: Record<ReportableStatus, string> = {
  yes: "Pentru raportare",
  no: "Neraportabil",
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
  extractedFields: ExtractedFields | null;
  rawText: string | null;
  errorMessage: string | null;
  // Invoice Reporting verdict + review
  reportable: ReportableStatus;
  reportableReason: string | null;
  reportableConfidenceBp: number;
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
  opts: { page?: number; team?: FinDocTeam; month?: string; reportable?: ReportableStatus } = {},
): Promise<CapturesListResult> {
  const qs = new URLSearchParams({ page: String(opts.page ?? 1) });
  if (opts.team) qs.set("team", opts.team);
  if (opts.month) qs.set("month", opts.month);
  if (opts.reportable) qs.set("reportable", opts.reportable);
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
