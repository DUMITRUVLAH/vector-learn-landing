import { api, apiUpload, ApiError } from "../api";

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
export type PaymentAccountLang = "ro" | "ru" | "en";
export type PaymentAccountLayout = "modern" | "clasic" | "compact";

export interface PaymentAccountItem {
  id?: string;
  position?: number;
  description: string;
  unit: string;
  quantity: number | string;
  unitPriceCents: number;
  vatRate: number;
  productId?: string | null;
  lineSubtotalCents?: number;
  lineVatCents?: number;
  lineTotalCents?: number;
}

/** Clientul (cumpărătorul) — toate câmpurile care ajung pe cont. */
export interface PaymentAccountBuyer {
  buyerName: string;
  buyerIdno: string | null;
  buyerVatCode: string | null;
  buyerAddress: string | null;
  buyerCity: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  buyerIban: string | null;
  buyerBankName: string | null;
  buyerContact: string | null;
}

export interface PaymentAccount extends PaymentAccountBuyer {
  id: string;
  tenantId: string;
  clientId: string | null;
  crmCompanyId: string | null;
  leadId: string | null;
  templateId: string | null;
  series: string;
  number: number | null;
  documentNumber: string | null;
  status: PaymentAccountStatus;
  currency: string;
  lang: PaymentAccountLang;
  issueDate: string;
  dueDate: string | null;
  sellerName: string;
  sellerIdno: string | null;
  sellerVatCode: string | null;
  sellerAddress: string | null;
  sellerIban: string | null;
  sellerBankName: string | null;
  sellerBankCode: string | null;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAccountDetail extends PaymentAccount {
  items: Array<Required<Omit<PaymentAccountItem, "productId">> & { productId: string | null }>;
}

export interface PaymentAccountSettings {
  series: string;
  numberPattern: string;
  numberPad: number;
  numberStart: number;
  defaultVatRate: number;
  defaultDueDays: number;
  defaultLang: PaymentAccountLang;
  defaultNotes: string | null;
  layout: PaymentAccountLayout;
  accentColor: string;
  logoUrl: string | null;
  showLogo: boolean;
  showAmountWords: boolean;
  showSignature: boolean;
  showStamp: boolean;
  footerText: string | null;
}

export interface PaymentAccountIssuer {
  name: string;
  idno: string | null;
  vatCode: string | null;
  address: string | null;
  iban: string | null;
  bankName: string | null;
  bic: string | null;
  phone: string | null;
  email: string | null;
  administrator: string | null;
  administratorTitle: string | null;
  orgLogoUrl: string | null;
}

export interface PaymentAccountSettingsView {
  settings: PaymentAccountSettings;
  issuer: PaymentAccountIssuer;
  /** Logoul care apare efectiv pe cont (al contului sau al organizației). */
  logoUrl: string | null;
  /** Rechizitele care lipsesc, pe nume — gol = contul iese complet. */
  missing: string[];
  nextNumber: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  listPriceCents: number;
  currency: string;
  vatPercent: number;
  category: string | null;
  qtyOnHand: number | null;
  tracksStock: boolean;
}

export interface CatalogRecent {
  description: string;
  unit: string;
  unitPriceCents: number;
  vatRate: number;
  uses: number;
  lastUsed: string;
}

export interface PaymentAccountTemplate {
  id: string;
  name: string;
  buyer: Partial<PaymentAccountBuyer> & { crmCompanyId?: string | null } | null;
  items: Array<{ description: string; unit: string; quantity: number; unitPriceCents: number; vatRate: number; productId?: string | null }>;
  currency: string;
  notes: string | null;
  dueDays: number | null;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
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

export interface PaymentAccountInput extends Partial<Omit<PaymentAccountBuyer, "buyerName">> {
  buyerName: string;
  clientId?: string | null;
  crmCompanyId?: string | null;
  leadId?: string | null;
  templateId?: string | null;
  series?: string;
  currency?: string;
  lang?: PaymentAccountLang;
  issueDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  items: Array<{
    description: string;
    unit: string;
    quantity: number;
    unitPriceCents: number;
    vatRate: number;
    productId?: string | null;
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
  status?: PaymentAccountStatus,
  q = ""
): Promise<{ data: PaymentAccount[] }> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q.trim()) params.set("q", q.trim());
  const qs = params.toString();
  return api(`/api/payment-accounts${qs ? `?${qs}` : ""}`);
}

export function getPaymentAccount(id: string): Promise<{ data: PaymentAccountDetail }> {
  return api(`/api/payment-accounts/${id}`, { cache: "reload" });
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

/** Emite contul: fără `documentNumber` = numărul automat; cu el = numărul scris de mână (unic). */
export function issuePaymentAccount(id: string, documentNumber?: string | null): Promise<{ data: PaymentAccount }> {
  return api(`/api/payment-accounts/${id}/issue`, {
    method: "POST",
    body: JSON.stringify(documentNumber ? { documentNumber } : {}),
  });
}

export function duplicatePaymentAccount(id: string): Promise<{ data: PaymentAccount }> {
  return api(`/api/payment-accounts/${id}/duplicate`, { method: "POST", body: "{}" });
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

export function getNextPaymentAccountNumber(
  opts: { series?: string; date?: string | null; exclude?: string } = {}
): Promise<{ data: { series: string; number: number; documentNumber: string } }> {
  const params = new URLSearchParams();
  if (opts.series) params.set("series", opts.series);
  if (opts.date) params.set("date", opts.date);
  if (opts.exclude) params.set("exclude", opts.exclude);
  return api(`/api/payment-accounts/next-number?${params.toString()}`, { cache: "reload" });
}

/** URL-ul PDF-ului — același pentru previzualizare (iframe, aceeași origine) și descărcare. */
export function paymentAccountPdfUrl(id: string, opts: { download?: boolean; v?: string | number } = {}): string {
  const params = new URLSearchParams();
  if (opts.download) params.set("download", "1");
  if (opts.v !== undefined) params.set("v", String(opts.v));
  const qs = params.toString();
  // Vizualizatorul PDF din browser: pe lățimea cadrului, fără panoul de miniaturi (altfel se
  // deschide la ~38% și contul nu se poate citi). Fragmentul nu ajunge la server.
  const view = opts.download ? "" : "#navpanes=0&view=FitH";
  return `/api/payment-accounts/${id}/pdf${qs ? `?${qs}` : ""}${view}`;
}

export function paymentAccountSampleUrl(v: string | number): string {
  return `/api/payment-accounts/settings/sample.pdf?v=${encodeURIComponent(String(v))}#navpanes=0&view=FitH`;
}

// ── Setări (design + numerotare) ──

export function getPaymentAccountSettings(): Promise<{ data: PaymentAccountSettingsView }> {
  return api(`/api/payment-accounts/settings`, { cache: "reload" });
}

export function savePaymentAccountSettings(
  input: Partial<Omit<PaymentAccountSettings, "logoUrl">>
): Promise<{ data: PaymentAccountSettingsView }> {
  return api(`/api/payment-accounts/settings`, { method: "PUT", body: JSON.stringify(input) });
}

export function uploadPaymentAccountLogo(file: File): Promise<{ data: PaymentAccountSettingsView }> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload(`/api/payment-accounts/settings/logo`, form);
}

export function removePaymentAccountLogo(): Promise<{ data: PaymentAccountSettingsView }> {
  return api(`/api/payment-accounts/settings/logo`, { method: "DELETE" });
}

// ── Catalog + șabloane ──

export function getPaymentAccountCatalog(q = ""): Promise<{ data: { products: CatalogProduct[]; recent: CatalogRecent[] } }> {
  return api(`/api/payment-accounts/catalog${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
}

export function listPaymentAccountTemplates(): Promise<{ data: PaymentAccountTemplate[] }> {
  return api(`/api/payment-accounts/templates`, { cache: "reload" });
}

export function savePaymentAccountTemplate(input: {
  name: string;
  fromAccountId?: string;
  includeBuyer?: boolean;
}): Promise<{ data: PaymentAccountTemplate }> {
  return api(`/api/payment-accounts/templates`, { method: "POST", body: JSON.stringify(input) });
}

export function deletePaymentAccountTemplate(id: string): Promise<{ ok: true }> {
  return api(`/api/payment-accounts/templates/${id}`, { method: "DELETE" });
}

/** Pornește o ciornă din șablon; clientul dat aici bate clientul salvat în șablon. */
export function startFromPaymentAccountTemplate(
  id: string,
  buyer?: Partial<PaymentAccountBuyer>
): Promise<{ data: PaymentAccount }> {
  return api(`/api/payment-accounts/templates/${id}/use`, { method: "POST", body: JSON.stringify(buyer ?? {}) });
}

/** Mesajul omenesc al unei erori de API (rutele trimit `message` lângă cod). */
export function paymentAccountErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const msg = err.body?.message;
    if (typeof msg === "string" && msg.trim()) return msg;
    if (err.code === "number_taken") return "Numărul ales e deja folosit.";
    if (err.code === "only_draft_editable") return "Contul e deja emis și nu se mai poate modifica.";
  }
  return err instanceof Error && err.message && !/^http_\d+$/.test(err.message) ? err.message : fallback;
}

// ── Helpers ──

export function formatMdl(cents: number, currency = "MDL"): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
