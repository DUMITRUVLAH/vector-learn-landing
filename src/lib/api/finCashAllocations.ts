/**
 * CASH-003: FinDesk — API client pentru alocare plată↔factură + credit nealocat
 *
 * Endpoints:
 *   POST /api/fin/cash/payments               — înregistrare manuală plată
 *   GET  /api/fin/cash/payments               — lista plăților cu unallocated_cents
 *   GET  /api/fin/cash/payments/:id           — detalii plată + alocări
 *   POST /api/fin/cash/payments/:id/allocate  — alocă sum_cents din plată la factură
 *   DELETE /api/fin/cash/allocations/:id       — dealocă (șterge alocarea)
 *   GET  /api/fin/cash/credit-summary         — credit nealocat per client
 *   POST /api/fin/cash/transactions/:id/ignore             — marchează ignored
 *   POST /api/fin/cash/transactions/:id/create-payment     — crează plată din tranzacție
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinPayment {
  id: string;
  tenantId: string;
  partyId: string | null;
  receivedDate: string;
  amountCents: number;
  currency: string;
  accountLabel: string | null;
  allocatedCents: number;
  unallocatedCents: number;
  bankTxId: string | null;
  notes: string | null;
  createdAt: string;
  allocations?: FinPaymentAllocation[];
}

export interface FinPaymentAllocation {
  id: string;
  tenantId: string;
  paymentId: string;
  invoiceId: string;
  amountCents: number;
  createdAt: string;
}

export interface CreditSummaryRow {
  partyId: string | null;
  unallocatedCents: number;
  currency: string;
}

export interface PaymentsListResult {
  payments: FinPayment[];
  total: number;
  page: number;
}

// ─── API functions ────────────────────────────────────────────────────────────

/** Înregistrează o plată manuală (fără import bancar). */
export async function createPayment(payload: {
  partyId?: string;
  receivedDate: string;
  amountCents: number;
  currency?: string;
  accountLabel?: string;
  notes?: string;
}): Promise<{ payment: FinPayment }> {
  return api<{ payment: FinPayment }>("/api/fin/cash/payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Lista plăților cu unallocated_cents calculat. */
export async function getPayments(params?: {
  page?: number;
  from?: string;
  to?: string;
  accountLabel?: string;
  status?: "all" | "partial" | "full";
}): Promise<PaymentsListResult> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.accountLabel) qs.set("accountLabel", params.accountLabel);
  if (params?.status) qs.set("status", params.status);
  const q = qs.toString();
  return api<PaymentsListResult>(`/api/fin/cash/payments${q ? `?${q}` : ""}`);
}

/** Detalii plată cu lista alocărilor. */
export async function getPayment(id: string): Promise<{ payment: FinPayment }> {
  return api<{ payment: FinPayment }>(`/api/fin/cash/payments/${id}`);
}

/** Alocă `amount_cents` din plată la o factură. */
export async function allocatePayment(
  paymentId: string,
  payload: { invoiceId: string; amountCents: number }
): Promise<{ payment: FinPayment; allocation: FinPaymentAllocation }> {
  return api<{ payment: FinPayment; allocation: FinPaymentAllocation }>(
    `/api/fin/cash/payments/${paymentId}/allocate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

/** Șterge o alocare (scade din allocated_cents al plății). */
export async function deleteAllocation(
  allocationId: string
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/fin/cash/allocations/${allocationId}`, {
    method: "DELETE",
  });
}

/** Credit nealocat agregat per client (party_id). */
export async function getCreditSummary(): Promise<{ summary: CreditSummaryRow[] }> {
  return api<{ summary: CreditSummaryRow[] }>("/api/fin/cash/credit-summary");
}

/** Marchează tranzacție bancară ca ignored. */
export async function ignoreTransaction(txId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/fin/cash/transactions/${txId}/ignore`, {
    method: "POST",
  });
}

/** Crează plată din tranzacție bancară nepotrivită. */
export async function createPaymentFromTx(
  txId: string,
  payload?: { partyId?: string; notes?: string }
): Promise<{ payment: FinPayment }> {
  return api<{ payment: FinPayment }>(
    `/api/fin/cash/transactions/${txId}/create-payment`,
    {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    }
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export function formatAllocationPercent(payment: FinPayment): number {
  if (payment.amountCents === 0) return 0;
  return Math.round((payment.allocatedCents / payment.amountCents) * 100);
}
