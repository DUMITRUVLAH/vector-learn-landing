/**
 * BILL-005: FinDesk B2B Invoices API client
 *
 * Client-side wrappers for /api/fin/invoices endpoints.
 * Separate from src/lib/api/invoices.ts (which handles student B2C invoices).
 * FIN-CORE §1.5: B2B context only.
 */
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FinInvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "cancelled";

export interface FinInvoice {
  id: string;
  tenantId: string;
  agreementId: string | null;
  partyId: string | null;
  partyName?: string | null;
  series: string;
  number: number;
  invoiceNumber: string;
  status: FinInvoiceStatus;
  currency: string;
  issuedAt: string | null;
  dueDate: string | null;
  totalCents: number;
  vatTotalCents: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinInvoiceLine {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatPct: number;
  lineTotalCents: number;
  serviceId: string | null;
  createdAt: string;
}

export interface FinInvoiceWithLines extends FinInvoice {
  lines: FinInvoiceLine[];
}

export interface CreateFinInvoiceLineInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
  /** FIN-CORE Rule #1: required, use 0 for VAT-exempt */
  vatPct: number;
  serviceId?: string | null;
}

export interface CreateFinInvoiceInput {
  partyId?: string | null;
  agreementId?: string | null;
  lines: CreateFinInvoiceLineInput[];
  currency?: string;
  dueDate?: string | null;
  notes?: string | null;
}

export interface FinAgingBucket {
  count: number;
  totalCents: number;
}

export interface FinAgingResult {
  buckets: {
    current: FinAgingBucket;
    overdue_0_30: FinAgingBucket;
    overdue_31_60: FinAgingBucket;
    overdue_60_plus: FinAgingBucket;
  };
  overdueInvoices: Array<{
    id: string;
    invoiceNumber: string;
    partyId: string | null;
    totalCents: number;
    dueDate: string | null;
    daysOverdue: number;
  }>;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function listFinInvoices(params?: {
  status?: FinInvoiceStatus;
  partyId?: string;
  agreementId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: FinInvoice[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.partyId) q.set("partyId", params.partyId);
  if (params?.agreementId) q.set("agreementId", params.agreementId);
  if (params?.search) q.set("search", params.search);
  if (params?.limit !== undefined) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) q.set("offset", String(params.offset));
  const qs = q.toString();
  return api(`/api/fin/invoices${qs ? `?${qs}` : ""}`);
}

export async function getFinInvoice(id: string): Promise<{ data: FinInvoiceWithLines }> {
  return api(`/api/fin/invoices/${id}`);
}

export async function createFinInvoice(
  input: CreateFinInvoiceInput
): Promise<{ data: FinInvoiceWithLines }> {
  return api("/api/fin/invoices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateFinInvoice(
  id: string,
  patch: { status?: FinInvoiceStatus; notes?: string | null; dueDate?: string | null }
): Promise<{ data: FinInvoice }> {
  return api(`/api/fin/invoices/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteFinInvoice(id: string): Promise<{ data: FinInvoice }> {
  return api(`/api/fin/invoices/${id}`, { method: "DELETE" });
}

export async function getFinInvoiceAging(): Promise<{ data: FinAgingResult }> {
  return api("/api/fin/invoices/aging");
}

export async function getFinInvoiceAgingCount(): Promise<{ data: { count: number } }> {
  return api("/api/fin/invoices/aging/count");
}

export async function triggerFinInvoiceReminders(): Promise<{
  data: { created: number; skipped: number };
}> {
  return api("/api/fin/invoices/aging/reminders", { method: "POST" });
}

export async function getFinInvoicePdfHtml(
  id: string,
  lang: "ro" | "ru" | "en" = "ro"
): Promise<{ data: { html: string; invoiceNumber: string; lang: string } }> {
  return api(`/api/fin/invoices/${id}/pdf?lang=${lang}`);
}

/**
 * Fetch the alternative "Cont de plată" document as a Blob.
 * `format` "pdf" returns a real PDF (Playwright) or, where Chromium is unavailable,
 * a print-ready HTML fallback — inspect `blob.type` to tell which you got.
 * `format` "html" always returns the print-ready HTML (used for the live preview).
 */
export async function fetchFinInvoiceDocBlob(
  id: string,
  format: "pdf" | "html" = "pdf",
  lang: "ro" | "ru" | "en" = "ro"
): Promise<Blob> {
  const res = await fetch(`/api/fin/invoices/${id}/document.${format}?lang=${lang}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Document fetch failed (${res.status})`);
  }
  return res.blob();
}

/** One line of an ad-hoc "Cont de plată" (no saved invoice). */
export interface AdHocDocLineInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatPct: number;
  unit?: string | null;
}

/** Full payload for generating an ad-hoc "Cont de plată" document (client + services + price). */
export interface AdHocDocInput {
  invoiceNumber?: string;
  currency?: "MDL" | "EUR" | "USD";
  issuedAt?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  to: { name: string; idno?: string | null; address?: string | null };
  lines: AdHocDocLineInput[];
}

/**
 * Generate a standalone "Cont de plată" document from form data — NOT from a saved invoice.
 * This is the owner's intended flow: enter client + services + price, get a PDF to send.
 * Nothing is persisted. The server computes all totals; the issuer comes from the tenant.
 *
 * `format` "pdf" returns a real PDF (Playwright) or — where Chromium is unavailable — a
 * print-ready HTML fallback (inspect `blob.type`). "html" always returns HTML (live preview).
 * Throws with the server's validation message (e.g. missing client / no lines) on 400.
 */
export async function postFinInvoiceDocBlob(
  input: AdHocDocInput,
  format: "pdf" | "html" = "pdf",
  lang: "ro" | "ru" | "en" = "ro"
): Promise<Blob> {
  const res = await fetch(`/api/fin/invoices/document.${format}?lang=${lang}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let msg = `Document generation failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) msg = body.error;
    } catch {
      // keep the status-based fallback
    }
    throw new Error(msg);
  }
  return res.blob();
}

/** Utility: format cents as "L 1 200" or "€ 10,50" */
export function formatFinMoney(cents: number, currency = "MDL"): string {
  const v = Math.abs(Math.round(cents));
  const whole = Math.floor(v / 100);
  const frac = v % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const dec = frac ? "," + String(frac).padStart(2, "0") : "";
  const sym = currency === "MDL" ? "L" : currency;
  return `${cents < 0 ? "-" : ""}${sym} ${grouped}${dec}`;
}
