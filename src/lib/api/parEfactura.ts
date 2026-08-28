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

// ─── Lista brută a facturilor primite în SFS ─────────────────────────────────

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
  /** Linkul către factura din portalul SFS, dacă îl avem din codul QR. */
  portalUrl: string | null;
  /** Cererea PAR de care e legată factura (dacă a fost potrivită sau marcată manual). */
  linkedParId: string | null;
  linkedRequestNo: string | null;
}

export interface BuyerInvoiceList {
  available: boolean;
  source: "sfs" | "mock";
  message: string;
  invoices: BuyerInvoiceItem[];
  sfs: ParSfsSummary;
}

/**
 * Toate facturile în care organizația e cumpărător — nu doar cele legate de o plată PAR.
 * `refresh` forțează citirea din SFS (butonul „Reîncarcă"); implicit se poate servi cache-ul scurt.
 */
export async function getParEfacturaInvoices(refresh = false): Promise<BuyerInvoiceList> {
  return api<BuyerInvoiceList>(`/api/par/efactura/invoices${refresh ? "?refresh=1" : ""}`, {
    cache: refresh ? "reload" : undefined,
  });
}

// ─── Etichete ─────────────────────────────────────────────────────────────────

export const PAR_EFACTURA_STATUS_LABELS: Record<ParEfacturaStatus, string> = {
  not_applicable: "Nu se aplică",
  expected: "Lipsește",
  found: "Găsită în SFS",
  received_manual: "Primită (manual)",
};
