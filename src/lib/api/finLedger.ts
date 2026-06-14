/**
 * LEDGER-001/002: FinDesk General Ledger API client
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LedgerAccount {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  accountClass: string;
  parentCode: string | null;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TrialBalanceAccount {
  code: string;
  name: string;
  class: string;
  debitTotal: number;
  creditTotal: number;
  netBalance: number;
}

export interface TrialBalanceResponse {
  accounts: TrialBalanceAccount[];
  grandDebit: number;
  grandCredit: number;
  isBalanced: boolean;
  periodFrom: string | null;
  periodTo: string | null;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  entryDate: string;
  description: string | null;
  reference: string | null;
  sourceType: string;
  sourceId: string | null;
  status: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostEntryLine {
  accountCode: string;
  debitCents: number;
  creditCents: number;
  currency?: string;
  description?: string;
}

export interface PostEntryPayload {
  sourceType?: "PAY" | "BILL" | "SPEND" | "ASSET" | "MANUAL";
  sourceId?: string | null;
  entryDate: string;
  description?: string;
  reference?: string;
  lines: PostEntryLine[];
}

export interface PostEntryResponse {
  entryId: string;
  lineCount: number;
}

export interface PostPaymentResponse {
  entryId: string;
  existing: boolean;
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function listLedgerAccounts(params?: {
  class?: string;
  active?: boolean;
}): Promise<{ accounts: LedgerAccount[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.class) qs.set("class", params.class);
  if (params?.active != null) qs.set("active", String(params.active));
  const url = `/api/fin/ledger/accounts${qs.toString() ? `?${qs.toString()}` : ""}`;
  return api(url);
}

export async function getTrialBalance(params?: {
  from?: string;
  to?: string;
  class?: string;
}): Promise<TrialBalanceResponse> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.class) qs.set("class", params.class);
  const url = `/api/fin/ledger/trial-balance${qs.toString() ? `?${qs.toString()}` : ""}`;
  return api<TrialBalanceResponse>(url);
}

export async function listJournalEntries(params?: {
  page?: number;
  limit?: number;
  sourceType?: string;
  from?: string;
  to?: string;
}): Promise<{ data: JournalEntry[]; total: number; page: number }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.sourceType) qs.set("sourceType", params.sourceType);
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const url = `/api/fin/ledger/entries${qs.toString() ? `?${qs.toString()}` : ""}`;
  return api(url);
}

export async function postJournalEntry(
  payload: PostEntryPayload
): Promise<PostEntryResponse> {
  return api<PostEntryResponse>("/api/fin/ledger/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function postPaymentEntry(
  paymentId: string
): Promise<PostPaymentResponse> {
  return api<PostPaymentResponse>(`/api/fin/ledger/post-payment/${paymentId}`, {
    method: "POST",
  });
}

export async function seedLedgerAccounts(): Promise<{
  inserted: number;
  message: string;
}> {
  return api("/api/fin/ledger/accounts/seed", { method: "POST" });
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatLedgerAmount(cents: number): string {
  return new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
