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
}

export interface FinCapture {
  id: string;
  tenantId: string;
  expenseId: string | null;
  fileKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: FinCaptureStatus;
  extractedFields: ExtractedFields | null;
  rawText: string | null;
  errorMessage: string | null;
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

export async function getCaptures(page = 1): Promise<CapturesListResult> {
  return api<CapturesListResult>(`/api/fin/captures?page=${page}`);
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
