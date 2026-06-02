/**
 * PAY-007: Refunds API client
 */
import { api } from "../api";

export type RefundStatus = "pending" | "completed" | "failed";
export type RefundMethod = "stripe" | "manual";

export interface Refund {
  id: string;
  tenantId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  reason: string;
  method: RefundMethod;
  stripeRefundId: string | null;
  processedBy: string | null;
  processedAt: string;
  status: RefundStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessRefundResult {
  refund: Refund;
  invoice_status: string;
  refunded_amount_cents: number;
}

/** POST /api/invoices/:id/refund — process a refund on a paid invoice */
export function processRefund(
  invoiceId: string,
  input: { amount_cents: number; reason: string }
): Promise<ProcessRefundResult> {
  return api<ProcessRefundResult>(`/api/invoices/${invoiceId}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** GET /api/refunds — list all refunds for tenant */
export function listRefunds(params?: {
  month?: string;
  status?: RefundStatus;
}): Promise<{ items: Refund[] }> {
  const qs = new URLSearchParams();
  if (params?.month) qs.set("month", params.month);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();
  return api<{ items: Refund[] }>(`/api/refunds${query ? `?${query}` : ""}`);
}

/** GET /api/invoices/:id/refunds — list refunds for a specific invoice */
export function listInvoiceRefunds(invoiceId: string): Promise<{ items: Refund[] }> {
  return api<{ items: Refund[] }>(`/api/invoices/${invoiceId}/refunds`);
}
