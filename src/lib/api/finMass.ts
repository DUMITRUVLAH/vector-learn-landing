/**
 * MASS-002: Client-side API helpers for the FinDesk Bulk Operations module.
 * All requests go to /api/fin/mass/*.
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FinBulkJobStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export type FinBulkRowStatus =
  | "pending"
  | "success"
  | "fail"
  | "skipped"
  | "cancelled";

export type FinBulkJobType =
  | "recurring_invoices"
  | "csv_import_parties"
  | "csv_import_spend";

export interface FinBulkJob {
  id: string;
  tenantId: string;
  jobType: FinBulkJobType;
  status: FinBulkJobStatus;
  totalRows: number;
  successRows: number;
  failRows: number;
  createdBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface FinBulkRow {
  id: string;
  jobId: string;
  rowIndex: number;
  externalRef: string | null;
  status: FinBulkRowStatus;
  retryCount: number;
  errorMessage: string | null;
  resultRef: string | null;
  processedAt: string | null;
  createdAt: string;
}

// ─── API functions ────────────────────────────────────────────────────────────

/** Start a recurring invoices bulk job */
export async function startRecurringInvoicesJob(params: {
  period?: string;
  includeEinv?: boolean;
}): Promise<{ jobId: string; totalRows: number }> {
  return api<{ jobId: string; totalRows: number }>("/api/fin/mass/recurring-invoices", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/** List bulk jobs for the current tenant */
export async function listBulkJobs(params?: {
  limit?: number;
  offset?: number;
}): Promise<{ jobs: FinBulkJob[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const query = qs.toString() ? `?${qs}` : "";
  return api<{ jobs: FinBulkJob[]; total: number }>(`/api/fin/mass/jobs${query}`);
}

/** Get a single job + all its rows */
export async function getBulkJob(jobId: string): Promise<{
  job: FinBulkJob;
  rows: FinBulkRow[];
}> {
  return api<{ job: FinBulkJob; rows: FinBulkRow[] }>(
    `/api/fin/mass/jobs/${jobId}`
  );
}
