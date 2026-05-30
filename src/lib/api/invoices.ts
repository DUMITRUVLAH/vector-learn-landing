import { api } from "../api";

export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";
export type InvoiceCurrency = "EUR" | "RON" | "USD";

export interface Invoice {
  id: string;
  tenantId: string;
  studentId: string;
  paymentId: string | null;
  series: string;
  number: number;
  invoiceNumber: string;
  amountCents: number;
  currency: InvoiceCurrency;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  pdfKey: string | null;
  createdAt: string;
  studentName: string;
}

export interface InvoicePdfResult {
  invoiceNumber: string;
  html: string;
}

export function listInvoices(params?: {
  status?: InvoiceStatus;
  month?: string;
}): Promise<{ items: Invoice[] }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.month) qs.set("month", params.month);
  const query = qs.toString();
  return api<{ items: Invoice[] }>(`/api/invoices${query ? `?${query}` : ""}`);
}

export function createInvoice(input: {
  studentId: string;
  paymentId?: string | null;
  amountCents: number;
  currency?: InvoiceCurrency;
  series?: string;
  dueDate?: string | null;
  notes?: string | null;
}): Promise<Invoice> {
  return api<Invoice>("/api/invoices", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getInvoicePdf(id: string): Promise<InvoicePdfResult> {
  return api<InvoicePdfResult>(`/api/invoices/${id}/pdf`);
}

export function updateInvoiceStatus(
  id: string,
  status: InvoiceStatus,
  extras?: { notes?: string | null; dueDate?: string | null }
): Promise<Invoice> {
  return api<Invoice>(`/api/invoices/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, ...extras }),
  });
}

export interface DebtSummaryItem {
  id: string;
  fullName: string;
  debtCents: number;
  email: string | null;
  phone: string | null;
}

export function getDebtSummary(): Promise<{ items: DebtSummaryItem[] }> {
  return api<{ items: DebtSummaryItem[] }>("/api/invoices/debt-summary");
}

// ── FIN-603: Subscriptions ────────────────────────────────────────────────────

export type SubscriptionStatus = "active" | "paused" | "cancelled";

export interface Subscription {
  id: string;
  tenantId: string;
  studentId: string;
  amountCents: number;
  currency: InvoiceCurrency;
  billingDay: number;
  description: string | null;
  status: SubscriptionStatus;
  nextBillingDate: string;
  createdAt: string;
  studentName: string;
}

export interface RunBillingResult {
  processed: number;
  invoicesCreated: string[];
}

export function listSubscriptions(): Promise<{ items: Subscription[] }> {
  return api<{ items: Subscription[] }>("/api/invoices/subscriptions");
}

export function createSubscription(input: {
  studentId: string;
  amountCents: number;
  currency?: InvoiceCurrency;
  billingDay: number;
  description?: string | null;
}): Promise<Subscription> {
  return api<Subscription>("/api/invoices/subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSubscription(
  id: string,
  patch: { status?: SubscriptionStatus; amountCents?: number; description?: string | null }
): Promise<Subscription> {
  return api<Subscription>(`/api/invoices/subscriptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function runBilling(): Promise<RunBillingResult> {
  return api<RunBillingResult>("/api/invoices/subscriptions/run-billing", {
    method: "POST",
  });
}

// ── FIN-604: e-Factura + SAGA CSV ─────────────────────────────────────────────

/**
 * Triggers XML download for the invoice (e-Factura UBL 2.1).
 * Opens the download URL in the browser via window.location.href.
 */
export function downloadEfacturaXml(id: string): void {
  window.location.href = `/api/invoices/${id}/efactura`;
}

/**
 * Triggers SAGA CSV download for the given month.
 * Opens the download URL in the browser via window.location.href.
 */
export function downloadSagaCsv(month?: string): void {
  const qs = month ? `?month=${encodeURIComponent(month)}` : "";
  window.location.href = `/api/invoices/export/saga-csv${qs}`;
}
