import { api } from "../api";

export interface Payment {
  id: string;
  studentId: string;
  amountCents: number;
  currency: "EUR" | "RON" | "USD";
  status: "pending" | "paid" | "overdue" | "refunded" | "cancelled";
  dueDate: string | null;
  paidAt: string | null;
  description: string | null;
  /** INTEG-102: course FK */
  courseId?: string | null;
  /** INTEG-102: course name resolved server-side */
  courseName?: string | null;
  /** APPROVAL-002: PAR request that authorized this payment */
  parRequestId?: string | null;
  createdAt: string;
  studentName: string;
}

export interface PaymentStats {
  monthPaidCents: number;
  pendingCents: number;
  overdueCents: number;
}

export function listPayments(): Promise<{ items: Payment[] }> {
  return api<{ items: Payment[] }>("/api/payments");
}

export function paymentStats(): Promise<PaymentStats> {
  return api<PaymentStats>("/api/payments/stats");
}

export function createPayment(input: {
  studentId: string;
  amountCents: number;
  currency?: "EUR" | "RON" | "USD";
  status?: "pending" | "paid" | "overdue" | "refunded" | "cancelled";
  dueDate?: string | null;
  description?: string | null;
  /** INTEG-102 */
  courseId?: string | null;
}): Promise<Payment> {
  return api<Payment>("/api/payments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePaymentStatus(
  id: string,
  status: Payment["status"]
): Promise<Payment> {
  return api<Payment>(`/api/payments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

// FIN-602: Link a payment to an invoice
export function linkPaymentToInvoice(paymentId: string, invoiceId: string): Promise<unknown> {
  return api(`/api/payments/${paymentId}/link-invoice`, {
    method: "PATCH",
    body: JSON.stringify({ invoiceId }),
  });
}

// APPROVAL-002: Link an approved PAR to a payment
export function linkParToPayment(paymentId: string, parRequestId: string): Promise<{
  id: string;
  par_request_id: string | null;
  amount_cents: number;
  status: string;
}> {
  return api(`/api/payments/${paymentId}/link-par`, {
    method: "POST",
    body: JSON.stringify({ par_request_id: parRequestId }),
  });
}

// APPROVAL-002: List payments that still need PAR approval
export function listPendingApproval(): Promise<{ items: Payment[]; threshold_mdl: number }> {
  return api<{ items: Payment[]; threshold_mdl: number }>("/api/payments/pending-approval");
}
