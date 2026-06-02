/**
 * PAY-008: Accounting export API client.
 */
import { api } from "../api";

export type AccountingFormat = "saga" | "1c";
export type AccountingTransactionType = "payment" | "refund" | "payout";

export interface AccountingMapping {
  id: string;
  tenantId: string;
  transactionType: AccountingTransactionType;
  accountCode: string;
  descriptionTemplate: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingSummary {
  income: number;
  refunds: number;
  payouts: number;
  net: number;
  transactions_count: number;
}

/** Trigger CSV download directly (opens as file download) */
export function downloadAccountingExport(month: string, format: AccountingFormat = "saga"): void {
  window.location.href = `/api/accounting/export?month=${encodeURIComponent(month)}&format=${format}`;
}

export function getAccountingSummary(month: string): Promise<AccountingSummary> {
  return api<AccountingSummary>(
    `/api/accounting/summary?month=${encodeURIComponent(month)}`
  );
}

export function listAccountingMappings(): Promise<{ items: AccountingMapping[] }> {
  return api<{ items: AccountingMapping[] }>("/api/accounting/mappings");
}

export function upsertAccountingMapping(input: {
  transactionType: AccountingTransactionType;
  accountCode: string;
  descriptionTemplate?: string;
}): Promise<AccountingMapping> {
  return api<AccountingMapping>("/api/accounting/mappings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAccountingMapping(
  id: string,
  patch: { accountCode?: string; descriptionTemplate?: string }
): Promise<AccountingMapping> {
  return api<AccountingMapping>(`/api/accounting/mappings/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
