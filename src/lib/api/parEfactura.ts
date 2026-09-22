/**
 * PAR-EFP: client pentru urmărirea e-Facturii pe care prestatorul o emite după plata unui PAR.
 * Rutele trăiesc în server/routes/parEfactura.ts.
 */
import { api } from "../api";

export type ParEfacturaStatus = "not_applicable" | "expected" | "found" | "received_manual";

export interface ParEfacturaState {
  status: ParEfacturaStatus;
  supplierIdno: string | null;
  sfsSeria: string | null;
  sfsNumber: string | null;
  sfsInvoiceStatus: number | null;
  /** Eticheta SFS a statusului („Trimis la Cumpărător", „Acceptat de Cumpărător"…). */
  sfsInvoiceStatusLabel: string | null;
  invoiceDate: string | null;
  invoiceTotalCents: number | null;
  lastScanAt: string | null;
  lastScanSource: string | null;
  lastScanMessage: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
  lastReminderToEmail: string | null;
  markedNote: string | null;
}

export interface ParSfsSummary {
  /** true doar când există credențiale ȘI mediul nu e „mock" — adică se poate verifica real. */
  configured: boolean;
  environment: "mock" | "test" | "prod" | null;
  idno: string | null;
  bankAccount?: string | null;
  hasCredentials: boolean;
  lastTestedAt: string | null;
}

export interface ParEfacturaScanResult {
  available: boolean;
  source: "sfs" | "mock";
  checked: number;
  found: number;
  missing: number;
  invoicesFetched: number;
  message: string;
}

export interface ParEfacturaQueueItem {
  parId: string;
  requestNo: string;
  payeeName: string;
  payeeIdnp: string | null;
  vendorContactEmail: string | null;
  endUse: string | null;
  currency: string;
  amountCents: number;
  paidAt: string | null;
  requestedBy: { id: string; name: string | null; email: string } | null;
  state: ParEfacturaState | null;
}

export interface ParEfacturaQueue {
  items: ParEfacturaQueueItem[];
  counts: { missing: number; found: number; receivedManual: number; notApplicable: number };
  filter: string;
  sfs: ParSfsSummary;
}

export type ParEfacturaFilter = "missing" | "found" | "all";

export async function getParEfacturaQueue(filter: ParEfacturaFilter = "missing"): Promise<ParEfacturaQueue> {
  return api<ParEfacturaQueue>(`/api/par/efactura?filter=${filter}`);
}

export async function scanParEfacturas(): Promise<{ result: ParEfacturaScanResult; sfs: ParSfsSummary }> {
  return api<{ result: ParEfacturaScanResult; sfs: ParSfsSummary }>("/api/par/efactura/scan", { method: "POST" });
}

export interface ParEfacturaDetail {
  parId: string;
  requestNo: string;
  payeeName: string;
  vendorContactEmail: string | null;
  canManage: boolean;
  state: ParEfacturaState | null;
  sfs: ParSfsSummary;
}

export async function getParEfactura(parId: string): Promise<ParEfacturaDetail> {
  return api<ParEfacturaDetail>(`/api/par/efactura/requests/${parId}`);
}

export async function scanParEfactura(
  parId: string
): Promise<{ result: ParEfacturaScanResult; state: ParEfacturaState | null; sfs: ParSfsSummary }> {
  return api(`/api/par/efactura/requests/${parId}/scan`, { method: "POST" });
}

export interface ParEfacturaReminderResult {
  sent: boolean;
  emailed: boolean;
  toAddress: string | null;
  reminderCount: number;
  lastReminderAt: string;
}

export async function sendParEfacturaReminder(parId: string): Promise<ParEfacturaReminderResult> {
  return api<ParEfacturaReminderResult>(`/api/par/efactura/requests/${parId}/reminder`, { method: "POST" });
}

export async function markParEfacturaReceived(
  parId: string,
  input: { seria?: string; number?: string; note?: string }
): Promise<{ state: ParEfacturaState | null }> {
  return api(`/api/par/efactura/requests/${parId}/mark-received`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getParSfsSettings(): Promise<{ sfs: ParSfsSummary }> {
  return api<{ sfs: ParSfsSummary }>("/api/par/efactura/settings");
}

export async function saveParSfsSettings(input: {
  idno: string;
  bank_account: string;
  environment: "mock" | "test" | "prod";
  username?: string;
  password?: string;
}): Promise<{ sfs: ParSfsSummary }> {
  return api<{ sfs: ParSfsSummary }>("/api/par/efactura/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function testParSfsConnection(): Promise<{ ok: boolean; message: string }> {
  return api<{ ok: boolean; message: string }>("/api/par/efactura/settings/test", { method: "POST" });
}

// ─── Lista facturilor primite în SFS (copia locală) ──────────────────────────

export interface BuyerInvoiceItem {
  seria: string;
  number: string;
  invoiceStatus: number;
  invoiceStatusLabel: string;
  supplierIdno: string | null;
  supplierName: string | null;
  buyerIdno: string | null;
  invoiceDate: string | null;
  totalCents: number | null;
  /**
   * Linkul din codul QR către portalul SFS. NU se afișează ca link: în afara sesiunii din portal
   * întoarce 404 (verificat). Rămâne în date pentru diagnostic.
   */
  portalUrl: string | null;
  /** false = știm doar că factura există; conținutul nu a fost încă citit din SFS. */
  detailsRead: boolean;
  /** Cererea PAR de care e legată factura (dacă a fost potrivită sau marcată manual). */
  linkedParId: string | null;
  linkedRequestNo: string | null;
}

/** Un furnizor din copia locală — pentru filtrul „Furnizor". */
export interface SupplierFacet {
  idno: string;
  name: string | null;
  count: number;
  totalCents: number;
}

/** Unde a ajuns citirea din SFS. Alimentează bara de progres și bucla de loturi. */
export interface InvoiceSyncProgress {
  total: number;
  detailed: number;
  pending: number;
  archiveDone: boolean;
  /** Câți ani în urmă acoperă recuperarea istoricului. */
  historyYears: number;
  archiveCursorTo: string | null;
  headsSyncedAt: string | null;
  lastBatchAt: string | null;
  lastMessage: string | null;
  lastError: string | null;
  /** true = nu mai e nimic de adus; bucla de loturi se poate opri. */
  done: boolean;
}

export interface BuyerInvoiceList {
  available: boolean;
  source: "sfs" | "mock";
  /** true = mai sunt facturi de adus din SFS (sau nu s-a citit încă nimic). */
  needsSync: boolean;
  message: string;
  invoices: BuyerInvoiceItem[];
  total: number;
  totalCents: number;
  page: number;
  pageSize: number;
  suppliers: SupplierFacet[];
  range: { oldest: string | null; newest: string | null };
  sync: InvoiceSyncProgress;
  sfs: ParSfsSummary;
}

export type InvoiceSort = "date_desc" | "date_asc" | "supplier_asc" | "amount_desc" | "amount_asc";

export interface InvoiceQuery {
  /** Perioada, ca `YYYY-MM-DD`. */
  from?: string | null;
  to?: string | null;
  /** Codul fiscal al furnizorului. */
  supplier?: string | null;
  q?: string | null;
  sort?: InvoiceSort;
  page?: number;
  pageSize?: number;
}

/**
 * O pagină din copia locală a facturilor — citire instantanee din baza proprie, ZERO apeluri SFS.
 * Aducerea facturilor noi se face separat, cu `syncParEfacturaInvoices`.
 */
export async function getParEfacturaInvoices(query: InvoiceQuery = {}): Promise<BuyerInvoiceList> {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.supplier) params.set("supplier", query.supplier);
  if (query.q) params.set("q", query.q);
  if (query.sort) params.set("sort", query.sort);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const qs = params.toString();
  return api<BuyerInvoiceList>(`/api/par/efactura/invoices${qs ? `?${qs}` : ""}`);
}

export interface InvoiceSyncResult {
  available: boolean;
  busy: boolean;
  discovered: number;
  detailsRead: number;
  message: string;
  progress: InvoiceSyncProgress;
}

/**
 * UN lot de citire din SFS (câteva secunde), apoi se oprește. Se apelează repetat până când
 * `progress.done` e true — așa se recuperează un istoric de mii de facturi fără să se blocheze
 * nimic, iar progresul se păstrează între vizite.
 */
export async function syncParEfacturaInvoices(refresh = false): Promise<InvoiceSyncResult> {
  return api<InvoiceSyncResult>(`/api/par/efactura/invoices/sync${refresh ? "?refresh=1" : ""}`, {
    method: "POST",
  });
}

/** Starea sincronizării, fără să atingă SFS. */
export async function getParEfacturaSyncProgress(): Promise<{ progress: InvoiceSyncProgress }> {
  return api<{ progress: InvoiceSyncProgress }>("/api/par/efactura/invoices/sync");
}

/** Șterge copia locală și reia citirea istoricului de la zero (par_admin). */
export async function resetParEfacturaInvoices(): Promise<{ progress: InvoiceSyncProgress }> {
  return api<{ progress: InvoiceSyncProgress }>("/api/par/efactura/invoices/reset", { method: "POST" });
}

// ─── Conținutul unei facturi ─────────────────────────────────────────────────

export interface SfsInvoiceParty {
  idno: string | null;
  name: string | null;
  address: string | null;
  bankAccount: string | null;
  bankName: string | null;
  bankCode: string | null;
}

export interface SfsInvoiceLineDetail {
  name: string;
  unitOfMeasure: string | null;
  quantity: number | null;
  unitPriceWithoutVatCents: number | null;
  totalWithoutVatCents: number | null;
  vatRate: string | null;
  vatCents: number | null;
  totalCents: number | null;
}

export interface SfsInvoiceDetail {
  seria: string | null;
  number: string | null;
  issuedDate: string | null;
  deliveryDate: string | null;
  supplier: SfsInvoiceParty;
  buyer: SfsInvoiceParty;
  loadingPoint: string | null;
  unloadingPoint: string | null;
  totalCents: number | null;
  totalVatCents: number | null;
  lines: SfsInvoiceLineDetail[];
  signed: boolean;
}

export interface BuyerInvoiceDetailResponse {
  available: boolean;
  message: string;
  seria: string;
  number: string;
  invoiceStatus: number | null;
  invoiceStatusLabel: string | null;
  detail: SfsInvoiceDetail | null;
}

/** Tot ce scrie în factură: părți, date, puncte de livrare, totaluri și liniile de marfă. */
export async function getBuyerInvoiceDetail(seria: string, number: string): Promise<BuyerInvoiceDetailResponse> {
  return api<BuyerInvoiceDetailResponse>(`/api/par/efactura/invoices/${encodeURIComponent(seria)}/${encodeURIComponent(number)}`);
}

/** Adresa documentului PDF oficial (servit de server din SFS, cu sesiunea utilizatorului). */
export function parEfacturaPdfUrl(seria: string, number: string): string {
  return `/api/par/efactura/invoices/${encodeURIComponent(seria)}/${encodeURIComponent(number)}/pdf`;
}

// ─── Etichete ─────────────────────────────────────────────────────────────────

export const PAR_EFACTURA_STATUS_LABELS: Record<ParEfacturaStatus, string> = {
  not_applicable: "Nu se aplică",
  expected: "Lipsește",
  found: "Găsită în SFS",
  received_manual: "Primită (manual)",
};
