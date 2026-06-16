/**
 * Team Docs reconciliation + VAT-on-imports — API client.
 */
import { api } from "../api";

export interface MissingInvoiceTx {
  id: string;
  txDate: string;
  amountCents: number;
  counterparty: string | null;
  reference: string | null;
  accountLabel: string | null;
}

export interface VatImportLine {
  txId: string;
  company: string;
  baseCents: number;
  vatRateBp: number;
  vatCents: number;
}

export interface SyncResult {
  totalTransactions: number;
  matchedCount: number;
  missingInvoiceCount: number;
  missingInvoices: MissingInvoiceTx[];
  vatImports: VatImportLine[];
  vatImportTotalCents: number;
}

export async function runSync(): Promise<SyncResult> {
  return api<SyncResult>("/api/fin/reconcile/sync", { method: "POST" });
}

export interface VatImportCompany {
  id: string;
  tenantId: string;
  name: string;
  idno: string | null;
  vatRateBp: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getVatCompanies(): Promise<VatImportCompany[]> {
  const r = await api<{ companies: VatImportCompany[] }>("/api/fin/reconcile/vat-companies");
  return r.companies;
}

export async function addVatCompany(payload: {
  name: string;
  idno?: string | null;
  vatRateBp?: number;
}): Promise<VatImportCompany> {
  const r = await api<{ company: VatImportCompany }>("/api/fin/reconcile/vat-companies", {
    method: "POST",
    body: JSON.stringify({ ...payload, vatRateBp: payload.vatRateBp ?? 2000, isActive: true }),
  });
  return r.company;
}

export async function deleteVatCompany(id: string): Promise<void> {
  await api(`/api/fin/reconcile/vat-companies/${id}`, { method: "DELETE" });
}
