/**
 * EXPORT-001: API client pentru modulul Export Contabil FinDesk
 * Endpoint-uri: /api/fin/export/*
 *
 * Toate funcțiile returnează un Blob pentru descărcare directă în browser.
 */

// ─── Helper download ──────────────────────────────────────────────────────────

async function downloadBlob(url: string, params?: Record<string, string>): Promise<Blob> {
  const qs = params ? new URLSearchParams(params).toString() : "";
  const fullUrl = qs ? `${url}?${qs}` : url;
  const res = await fetch(fullUrl, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.blob();
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Jurnal GL ────────────────────────────────────────────────────────────────

export interface JournalExportParams {
  from?: string;  // YYYY-MM-DD
  to?: string;    // YYYY-MM-DD
  account_code?: string;
}

export async function downloadJournalCsv(params?: JournalExportParams): Promise<Blob> {
  const p: Record<string, string> = {};
  if (params?.from) p.from = params.from;
  if (params?.to) p.to = params.to;
  if (params?.account_code) p.account_code = params.account_code;
  return downloadBlob("/api/fin/export/journal", p);
}

// ─── Balanță de verificare ────────────────────────────────────────────────────

export async function downloadTrialBalanceCsv(params?: { as_of?: string }): Promise<Blob> {
  const p: Record<string, string> = {};
  if (params?.as_of) p.as_of = params.as_of;
  return downloadBlob("/api/fin/export/trial-balance", p);
}

// ─── Facturi SFS Moldova ──────────────────────────────────────────────────────

export interface SfsInvoiceExportParams {
  from?: string;
  to?: string;
}

export async function downloadInvoicesSfsCsv(params?: SfsInvoiceExportParams): Promise<Blob> {
  const p: Record<string, string> = {};
  if (params?.from) p.from = params.from;
  if (params?.to) p.to = params.to;
  return downloadBlob("/api/fin/export/invoices-sfs", p);
}

// ─── SAF-T RO XML ─────────────────────────────────────────────────────────────

export interface SaftExportParams {
  year?: number;
  period?: string; // "1"–"12" sau "Q1"–"Q4"
}

export async function downloadSaftRoXml(params?: SaftExportParams): Promise<Blob> {
  const p: Record<string, string> = {};
  if (params?.year) p.year = String(params.year);
  if (params?.period) p.period = params.period;
  return downloadBlob("/api/fin/export/saf-t-ro", p);
}
