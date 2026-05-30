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
