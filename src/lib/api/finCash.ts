/**
 * CASH-002: FinDesk — API client pentru import CSV/MT940 + reconciliere
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FinTxDirection = "in" | "out";
export type FinTxMatchStatus = "unmatched" | "matched" | "duplicate" | "ignored";

export interface FinBankTransaction {
  id: string;
  tenantId: string;
  accountLabel: string;
  txDate: string;
  amountCents: number;
  currency: string;
  reference: string | null;
  counterparty: string | null;
  direction: FinTxDirection;
  importBatchId: string;
  matchStatus: FinTxMatchStatus;
  matchScoreBp: number; // 0..10000
  createdAt: string;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  matched: number;
  batchId: string;
  parseErrors: string[];
}

export interface TransactionsListResult {
  transactions: FinBankTransaction[];
  total: number;
  page: number;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function importFile(
  file: File,
  options?: { accountLabel?: string }
): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (options?.accountLabel) formData.append("accountLabel", options.accountLabel);

  const res = await fetch("/api/fin/cash/import", {
    method: "POST",
    credentials: "include",
    body: formData,
    // Don't set Content-Type — browser sets it with correct boundary
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `http_${res.status}`);
  }
  return res.json() as Promise<ImportResult>;
}

export async function getTransactions(page = 1): Promise<TransactionsListResult> {
  return api<TransactionsListResult>(`/api/fin/cash/transactions?page=${page}`);
}

export async function getUnmatched(): Promise<TransactionsListResult> {
  return api<TransactionsListResult>(`/api/fin/cash/unmatched`);
}

export async function matchTransaction(
  txId: string,
  payload: { paymentId?: string; invoiceId?: string }
): Promise<{ transaction: FinBankTransaction }> {
  return api<{ transaction: FinBankTransaction }>(`/api/fin/cash/transactions/${txId}/match`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Formatters ───────────────────────────────────────────────────────────────

export const MATCH_STATUS_LABELS: Record<FinTxMatchStatus, string> = {
  unmatched: "Nereconsiliat",
  matched: "Reconsiliat",
  duplicate: "Duplicat",
  ignored: "Ignorat",
};

export const DIRECTION_LABELS: Record<FinTxDirection, string> = {
  in: "Intrare",
  out: "Ieșire",
};

export function formatMatchScore(bp: number): string {
  return `${Math.round(bp / 100)}%`;
}
