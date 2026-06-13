/**
 * AGREEMENT-003: FinDesk — typed API fetchers for fin_agreements and fin_agreement_services.
 * Mirrors server/routes/finAgreements.ts endpoints.
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AgreementStatus = "draft" | "active" | "paused" | "cancelled";
export type BillingType = "recurring" | "one_time";
export type RecurrencePeriod = "monthly" | "quarterly" | "yearly";

export interface Agreement {
  id: string;
  tenantId: string;
  partyId: string | null;
  title: string;
  status: AgreementStatus;
  startDate: string | null;
  endDate: string | null;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Joined from fin_parties — may be present depending on query */
  partyName?: string | null;
}

export interface AgreementService {
  id: string;
  agreementId: string;
  name: string;
  description: string | null;
  billingType: BillingType;
  unitPriceCents: number;
  quantity: number;
  vatPct: number;
  recurrencePeriod: RecurrencePeriod | null;
  nextBillDate: string | null;
  lastBilledAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export function listAgreements(params?: {
  status?: AgreementStatus;
  partyId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: Agreement[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.partyId) qs.set("partyId", params.partyId);
  if (params?.search) qs.set("search", params.search);
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.offset) qs.set("offset", String(params.offset));
  const q = qs.toString();
  return api<{ data: Agreement[]; total: number }>(
    `/api/fin/agreements${q ? `?${q}` : ""}`
  );
}

export function getAgreement(id: string): Promise<{ data: Agreement }> {
  return api<{ data: Agreement }>(`/api/fin/agreements/${id}`);
}

export function createAgreement(input: {
  partyId?: string | null;
  title: string;
  status?: AgreementStatus;
  startDate?: string | null;
  endDate?: string | null;
  currency?: string;
  notes?: string | null;
}): Promise<{ data: Agreement }> {
  return api<{ data: Agreement }>("/api/fin/agreements", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAgreement(
  id: string,
  input: Partial<{
    partyId: string | null;
    title: string;
    status: AgreementStatus;
    startDate: string | null;
    endDate: string | null;
    currency: string;
    notes: string | null;
  }>
): Promise<{ data: Agreement }> {
  return api<{ data: Agreement }>(`/api/fin/agreements/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function cancelAgreement(id: string): Promise<{ data: Agreement }> {
  return api<{ data: Agreement }>(`/api/fin/agreements/${id}`, {
    method: "DELETE",
  });
}

export function listAgreementServices(
  agreementId: string
): Promise<{ data: AgreementService[] }> {
  return api<{ data: AgreementService[] }>(
    `/api/fin/agreements/${agreementId}/services`
  );
}

export function addAgreementService(
  agreementId: string,
  input: {
    name: string;
    description?: string | null;
    billingType: BillingType;
    unitPriceCents: number;
    quantity?: number;
    vatPct?: number;
    recurrencePeriod?: RecurrencePeriod | null;
    isActive?: boolean;
  }
): Promise<{ data: AgreementService }> {
  return api<{ data: AgreementService }>(
    `/api/fin/agreements/${agreementId}/services`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
}

export function deleteAgreementService(
  agreementId: string,
  serviceId: string
): Promise<void> {
  return api<void>(
    `/api/fin/agreements/${agreementId}/services/${serviceId}`,
    { method: "DELETE" }
  );
}
