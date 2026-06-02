import { api } from "../api";

// ──────────────────────────────────────────────
// CONT-PLATA: registry + payment accounts API client
// ──────────────────────────────────────────────

export interface RegistryCompany {
  id: number;
  idno: string | null;
  name: string;
  status: string;
  legalForm: string | null;
  registrationDate: string | null;
  liquidationDate: string | null;
  cuatmCode: string | null;
  address: string | null;
  city: string | null;
}

export interface RegistryCompanyDetail extends RegistryCompany {
  activities: { licensed: string[]; unlicensed: string[] };
  contacts: {
    websiteUrl: string | null;
    emails: string[];
    phones: string[];
    socialLinks: string[];
  };
}

export type PaymentAccountStatus = "draft" | "issued" | "paid" | "cancelled";

export interface PaymentAccountItem {
  id?: string;
  position?: number;
  description: string;
  unit: string;
  quantity: number | string;
  unitPriceCents: number;
  vatRate: number;
  lineSubtotalCents?: number;
  lineVatCents?: number;
  lineTotalCents?: number;
}

export interface PaymentAccount {
  id: string;
  tenantId: string;
  clientId: string | null;
  series: string;
  number: number | null;
  documentNumber: string | null;
  status: PaymentAccountStatus;
  currency: string;
  issueDate: string;
  dueDate: string | null;
  sellerName: string;
  sellerIdno: string | null;
  sellerVatCode: string | null;
  sellerAddress: string | null;
  sellerIban: string | null;
  sellerBankName: string | null;
  sellerBankCode: string | null;
  buyerName: string;
  buyerIdno: string | null;
  buyerAddress: string | null;
  buyerCity: string | null;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAccountDetail extends PaymentAccount {
  items: Required<PaymentAccountItem>[];
}

export interface SellerProfile {
  id: string;
  tenantId: string;
  name: string;
  idno: string | null;
  legalForm: string | null;
  vatCode: string | null;
  address: string | null;
  city: string | null;
  iban: string | null;
  bankName: string | null;
  bankCode: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultSeries: string;
  defaultVatRate: number;
}

export interface CompanyClient {
  id: string;
  tenantId: string;
  idno: string | null;
  name: string;
  legalForm: string | null;
  status: string | null;
  address: string | null;
  city: string | null;
  cuatmCode: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAccountInput {
  clientId?: string | null;
  series?: string;
  currency?: string;
  dueDate?: string | null;
  notes?: string | null;
  buyerName: string;
  buyerIdno?: string | null;
  buyerAddress?: string | null;
  buyerCity?: string | null;
  items: Array<{
    description: string;
    unit: string;
    quantity: number;
    unitPriceCents: number;
    vatRate: number;
  }>;
}

// ── Registry ──

export function searchRegistry(q: string): Promise<{ data: RegistryCompany[] }> {
  return api(`/api/registry/companies?q=${encodeURIComponent(q)}`);
}

export function getRegistryCompany(idno: string): Promise<{ data: RegistryCompanyDetail }> {
  return api(`/api/registry/companies/${encodeURIComponent(idno)}`);
}

// ── Seller profile ──

export function getSellerProfile(): Promise<{ data: SellerProfile | null }> {
  return api(`/api/seller-profile`);
}

export function saveSellerProfile(
  input: Partial<SellerProfile> & { name: string }
): Promise<{ data: SellerProfile }> {
  return api(`/api/seller-profile`, { method: "PUT", body: JSON.stringify(input) });
}

// ── Company clients ──

export function listClients(q = ""): Promise<{ data: CompanyClient[] }> {
  return api(`/api/company-clients${q ? `?q=${encodeURIComponent(q)}` : ""}`);
}

export function importClientByIdno(idno: string): Promise<{ data: CompanyClient }> {
  return api(`/api/company-clients/import`, {
    method: "POST",
    body: JSON.stringify({ idno }),
  });
}

export function deleteClient(id: string): Promise<{ ok: true }> {
  return api(`/api/company-clients/${id}`, { method: "DELETE" });
}

// ── Payment accounts ──

export function listPaymentAccounts(
  status?: PaymentAccountStatus
): Promise<{ data: PaymentAccount[] }> {
  return api(`/api/payment-accounts${status ? `?status=${status}` : ""}`);
}

export function getPaymentAccount(id: string): Promise<{ data: PaymentAccountDetail }> {
  return api(`/api/payment-accounts/${id}`);
}

export function createPaymentAccount(
  input: PaymentAccountInput
): Promise<{ data: PaymentAccount }> {
  return api(`/api/payment-accounts`, { method: "POST", body: JSON.stringify(input) });
}

export function updatePaymentAccount(
  id: string,
  input: PaymentAccountInput
): Promise<{ data: PaymentAccount }> {
  return api(`/api/payment-accounts/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function issuePaymentAccount(id: string): Promise<{ data: PaymentAccount }> {
  return api(`/api/payment-accounts/${id}/issue`, { method: "POST" });
}

export function setPaymentAccountStatus(
  id: string,
  status: "paid" | "cancelled" | "issued"
): Promise<{ data: PaymentAccount }> {
  return api(`/api/payment-accounts/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export function deletePaymentAccount(id: string): Promise<{ ok: true }> {
  return api(`/api/payment-accounts/${id}`, { method: "DELETE" });
}

// ── Helpers ──

export function formatMdl(cents: number, currency = "MDL"): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
