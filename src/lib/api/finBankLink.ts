/**
 * BANKLINK-002: Client API pentru modulul BankLink
 *
 * Acoperă: conexiuni bancare, import fișiere OFX/MT940, listare tranzacții importate.
 * BANKLINK-003 extinde cu auto-match, manual match, coadă reconciliere.
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ImportFormat = "OFX" | "MT940" | "CSV";
export type TransactionStatus = "unmatched" | "matched" | "ignored";

export interface BankConnection {
  id: string;
  tenantId: string;
  name: string;
  bankCode: string | null;
  accountIban: string | null;
  currency: string;
  importFormat: ImportFormat;
  isActive: boolean;
  lastImportAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankTransaction {
  id: string;
  bankConnectionId: string;
  tenantId: string;
  externalId: string;
  transactionDate: string; // YYYY-MM-DD
  valueDate: string | null;
  amountCents: number; // negativ = debit, pozitiv = credit
  currency: string;
  description: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  reference: string | null;
  status: TransactionStatus;
  matchedSourceType: string | null;
  matchedSourceId: string | null;
  importedAt: string;
  createdAt: string;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: string[];
  total: number;
}

export interface ListConnectionsResult {
  connections: BankConnection[];
  total: number;
}

export interface ListTransactionsParams {
  connectionId?: string;
  status?: TransactionStatus;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  page?: number;
  limit?: number;
}

export interface ListTransactionsResult {
  data: BankTransaction[];
  total: number;
  page: number;
}

export interface CreateConnectionBody {
  name: string;
  bankCode?: string;
  accountIban?: string;
  currency?: string;
  importFormat?: ImportFormat;
}

// ─── BANKLINK-003 types (queue + auto-match) ─────────────────────────────────

export interface MatchCandidate {
  id: string;
  type: "invoice" | "payment";
  scoreBp: number; // 0..10000
  scorePercent: number; // 0..100
  description: string;
  amountCents: number;
  dueDate: string | null;
}

export interface QueueItem extends BankTransaction {
  candidates: MatchCandidate[];
}

export interface QueueResult {
  data: QueueItem[];
  total: number;
  page: number;
}

export interface AutoMatchResult {
  matched: number;
  unmatched: number;
  skipped: number;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

/** Lista conexiunilor bancare active ale tenant-ului curent. */
export function listConnections(): Promise<ListConnectionsResult> {
  return api<ListConnectionsResult>("/api/fin/banklink/connections");
}

/** Creare conexiune nouă. */
export function createConnection(body: CreateConnectionBody): Promise<{ connection: BankConnection }> {
  return api<{ connection: BankConnection }>("/api/fin/banklink/connections", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Dezactivare (soft-delete) conexiune. */
export function deleteConnection(id: string): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/api/fin/banklink/connections/${id}`, {
    method: "DELETE",
  });
}

/** Listare tranzacții importate (paginat + filtrat). */
export function listTransactions(params: ListTransactionsParams = {}): Promise<ListTransactionsResult> {
  const q = new URLSearchParams();
  if (params.connectionId) q.set("connectionId", params.connectionId);
  if (params.status) q.set("status", params.status);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  return api<ListTransactionsResult>(`/api/fin/banklink/transactions?${q}`);
}

/** Import fișier OFX/MT940 pentru o conexiune. */
export function importFile(body: {
  connectionId: string;
  format: ImportFormat;
  content: string;
}): Promise<ImportResult> {
  return api<ImportResult>("/api/fin/banklink/import", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── BANKLINK-003: auto-match + manual match + queue ─────────────────────────

/** Rulează motorul de reconciliere automată pe toate tranzacțiile unmatched. */
export function autoMatch(): Promise<AutoMatchResult> {
  return api<AutoMatchResult>("/api/fin/banklink/auto-match", { method: "POST" });
}

/** Match/ignore manual al unei tranzacții. */
export function matchTransaction(
  id: string,
  body: { action: "match" | "ignore"; sourceType?: string; sourceId?: string }
): Promise<{ transaction: BankTransaction }> {
  return api<{ transaction: BankTransaction }>(`/api/fin/banklink/transactions/${id}/match`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Coadă reconciliere: tranzacțiile unmatched cu candidații sugerați. */
export function getQueue(params: { connectionId?: string; page?: number; limit?: number } = {}): Promise<QueueResult> {
  const q = new URLSearchParams();
  if (params.connectionId) q.set("connectionId", params.connectionId);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  return api<QueueResult>(`/api/fin/banklink/queue?${q}`);
}
