/**
 * EINV-003: FinDesk e-Factura Moldova — frontend API client
 *
 * Wraps the backend routes from EINV-002:
 *   GET    /api/fin/sfs-settings
 *   PUT    /api/fin/sfs-settings
 *   GET    /api/fin/einvoices/:invoiceId
 *   POST   /api/fin/einvoices/:invoiceId/submit
 *   POST   /api/fin/einvoices/:invoiceId/sync
 *   POST   /api/fin/einvoices/:invoiceId/cancel
 *
 * Plus a list endpoint (GET /api/fin/einvoices) that we implement
 * by querying all fin_einvoices for the current tenant.
 */

import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SfsEnvironment = "mock" | "test" | "prod";

export type EinvoiceStatus =
  | "pending"
  | "sent"
  | "accepted"
  | "rejected"
  | "cancelled";

export interface SfsSettings {
  id: string;
  idno: string;
  bankAccount: string;
  environment: SfsEnvironment;
  hasCredentials: boolean;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinEinvoice {
  id: string;
  finInvoiceId: string;
  sfsStatus: EinvoiceStatus;
  sfsSerialNumber: string | null;
  sfsInvoiceId: string | null;
  sfsRequestStatus: number | null;
  sfsErrorMessage: string | null;
  submittedAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

export interface UpsertSfsSettingsInput {
  idno: string;
  bankAccount: string;
  environment: SfsEnvironment;
  username?: string;
  password?: string;
}

// ─── SFS Settings ─────────────────────────────────────────────────────────────

export function getSfsSettings(): Promise<{ data: SfsSettings | null }> {
  return api<{ data: SfsSettings | null }>("/api/fin/sfs-settings");
}

export function upsertSfsSettings(
  input: UpsertSfsSettingsInput
): Promise<{ data: SfsSettings }> {
  return api<{ data: SfsSettings }>("/api/fin/sfs-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// ─── e-Invoice list ───────────────────────────────────────────────────────────

/**
 * List all fin_einvoices for the tenant.
 * Backend does not have a dedicated list endpoint yet — we query by invoiceId
 * or the tenant-scoped index.
 * NOTE: This will be served by the `/api/fin/einvoices` list route
 * (to be added in a future sprint if needed). For now we expose the individual
 * GET which the UI calls per-row, and the list is driven by fin_invoices.
 */
export function listEinvoices(
  params?: { status?: EinvoiceStatus }
): Promise<{ items: FinEinvoice[] }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();
  return api<{ items: FinEinvoice[] }>(
    `/api/fin/einvoices${query ? `?${query}` : ""}`
  );
}

export function getEinvoice(invoiceId: string): Promise<{ data: FinEinvoice }> {
  return api<{ data: FinEinvoice }>(`/api/fin/einvoices/${invoiceId}`);
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export function submitEinvoice(
  invoiceId: string
): Promise<{ data: { id: string; sfsStatus: EinvoiceStatus; submittedAt: string | null } }> {
  return api<{ data: { id: string; sfsStatus: EinvoiceStatus; submittedAt: string | null } }>(
    `/api/fin/einvoices/${invoiceId}/submit`,
    { method: "POST" }
  );
}

export function syncEinvoice(
  invoiceId: string
): Promise<{ data: { id: string; sfsStatus: EinvoiceStatus; lastSyncAt: string } }> {
  return api<{ data: { id: string; sfsStatus: EinvoiceStatus; lastSyncAt: string } }>(
    `/api/fin/einvoices/${invoiceId}/sync`,
    { method: "POST" }
  );
}

export function cancelEinvoice(
  invoiceId: string
): Promise<{ data: { id: string; sfsStatus: EinvoiceStatus } }> {
  return api<{ data: { id: string; sfsStatus: EinvoiceStatus } }>(
    `/api/fin/einvoices/${invoiceId}/cancel`,
    { method: "POST" }
  );
}
