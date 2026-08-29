/**
 * DG-103: clientul API pentru registrul de acte (/api/docs).
 * Sumele circulă în bani (cents) ca peste tot în aplicație — formatarea e treaba ecranului.
 */
import { api } from "@/lib/api";

export type DocStatus = "draft" | "final" | "cancelled";

export interface DocListItem {
  id: string;
  kind: string;
  docNumber: string | null;
  docDate: string;
  title: string;
  status: DocStatus;
  projectId: string | null;
  counterpartyId: string | null;
  counterpartyName: string | null;
  totalCents: number;
  currency: string;
  finalizedAt: string | null;
  cancelledAt: string | null;
}

export interface DocLine {
  id: string;
  position: number;
  description: string;
  unit: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  vatPercent: number;
}

export interface DocAuditEntry {
  id: string;
  action: string;
  createdAt: string;
  details: Record<string, unknown>;
}

export interface DocDetail extends DocListItem {
  eventId?: string | null;
  templateVersion?: number;
  missing?: string[];
  bodyHtml: string;
  bodyHash: string | null;
  cancelReason: string | null;
  templateId: string | null;
  counterpartySnapshot: Record<string, unknown>;
  context: Record<string, unknown>;
  lines: DocLine[];
  audit: DocAuditEntry[];
}

export interface DocFilters {
  status?: string;
  kind?: string;
  projectId?: string;
  counterpartyId?: string;
  q?: string;
  from?: string;
  to?: string;
}

export interface CreateDocBody {
  templateId?: string | null;
  projectId?: string | null;
  eventId?: string | null;
  docDate?: string;
  kind: string;
  title: string;
  counterparty?: {
    kind: "vendor" | "fin_party" | "inline";
    id?: string | null;
    name?: string | null;
    snapshot?: Record<string, string> | null;
  };
  context?: Record<string, string>;
  lines?: {
    description: string;
    unit?: string;
    quantity: number;
    unitPriceCents: number;
  }[];
  currency?: string;
}

export function listDocuments(filters: DocFilters = {}): Promise<DocListItem[]> {
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v != null && v !== "") as [string, string][]
  ).toString();
  return api<DocListItem[]>(`/api/docs/documents${qs ? `?${qs}` : ""}`);
}

export function getDocument(id: string): Promise<DocDetail> {
  return api<DocDetail>(`/api/docs/documents/${id}`);
}

export function createDocument(body: CreateDocBody): Promise<DocDetail> {
  return api<DocDetail>("/api/docs/documents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export interface UpdateDocBody extends Partial<CreateDocBody> {
  projectId?: string | null;
  eventId?: string | null;
  docDate?: string;
}

export function updateDocument(id: string, body: UpdateDocBody): Promise<DocDetail & { missing?: string[] }> {
  return api<DocDetail & { missing?: string[] }>(`/api/docs/documents/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function finalizeDocument(id: string): Promise<DocDetail> {
  return api<DocDetail>(`/api/docs/documents/${id}/finalize`, { method: "POST" });
}

export function cancelDocument(id: string, reason: string): Promise<DocDetail> {
  return api<DocDetail>(`/api/docs/documents/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** Etichetele tipurilor de act, într-un singur loc (ecran + filtre + dialog de creare). */
export const DOC_KIND_LABELS: Record<string, string> = {
  act_primire_predare: "Act de primire-predare",
  contract_servicii: "Contract de prestări servicii",
  contract_vanzare: "Contract de vânzare-cumpărare",
  act_aditional: "Act adițional",
  proces_verbal: "Proces-verbal de recepție",
  act_compensare: "Act de compensare",
  other: "Alt document",
};

export const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  draft: "Ciornă",
  final: "Finalizat",
  cancelled: "Anulat",
};

export interface DocTemplateListItem {
  id: string;
  name: string;
  kind: string;
  category: string | null;
  isSystem: boolean;
  version: number;
  placeholders: string[];
  updatedAt: string;
}

/** Biblioteca de acte. La prima deschidere instalează șabloanele standard ale produsului. */
export function listDocTemplates(): Promise<DocTemplateListItem[]> {
  return api<DocTemplateListItem[]>("/api/docs/templates");
}

export function cloneDocTemplate(id: string): Promise<{ id: string; name: string }> {
  return api<{ id: string; name: string }>(`/api/docs/templates/${id}/clone`, { method: "POST" });
}

export interface DocTemplateVersion {
  id: string;
  version: number;
  name: string;
  createdAt: string;
}

export function listTemplateVersions(id: string): Promise<DocTemplateVersion[]> {
  return api<DocTemplateVersion[]>(`/api/docs/templates/${id}/versions`);
}

export function restoreTemplateVersion(
  id: string,
  version: number
): Promise<{ version: number; restoredFrom: number }> {
  return api(`/api/docs/templates/${id}/restore/${version}`, { method: "POST" });
}

/** Previzualizare cu date de exemplu sau, mult mai util, cu rechizitele unui furnizor real. */
export function previewDocTemplate(
  id: string,
  vendorId?: string | null
): Promise<{ html: string }> {
  return api<{ html: string }>(`/api/docs/templates/${id}/preview`, {
    method: "POST",
    body: JSON.stringify({ vendorId: vendorId ?? null }),
  });
}

export interface DocToParResult {
  parId: string;
  requestNo: string;
  attachmentAdded: boolean;
}

/** Transformă actul finalizat în cerere de plată. `force` confirmă a doua cerere din același act. */
export function convertDocumentToPar(id: string, force = false): Promise<DocToParResult> {
  return api<DocToParResult>(
    `/api/docs/documents/${id}/to-par${force ? "?force=1" : ""}`,
    { method: "POST" }
  );
}

export interface DocTrailDocument {
  id: string;
  kind: string;
  docNumber: string | null;
  title: string;
  status: DocStatus;
  totalCents: number;
  currency: string;
}

export interface DocTrailPar {
  id: string;
  requestNo: string;
  status: string;
  totalEstimatedCents: number;
  currency: string;
  paidAt: string | null;
  approvedAt: string | null;
}

export interface DocTrail {
  document: DocTrailDocument;
  basedOn: DocTrailDocument[];
  derived: DocTrailDocument[];
  paymentRequests: DocTrailPar[];
}

export function getDocumentTrail(id: string): Promise<DocTrail> {
  return api<DocTrail>(`/api/docs/documents/${id}/trail`);
}

export function listDerivableKinds(id: string): Promise<{ kinds: string[] }> {
  return api<{ kinds: string[] }>(`/api/docs/documents/${id}/derivable`);
}

/** Actul derivat moștenește părțile, proiectul și pozițiile, cu referința la actul-sursă. */
export function deriveDocument(id: string, kind: string): Promise<DocDetail & { basedOn: string }> {
  return api(`/api/docs/documents/${id}/derive`, {
    method: "POST",
    body: JSON.stringify({ kind }),
  });
}

export interface DossierPaymentRequest {
  id: string;
  requestNo: string;
  status: string;
  totalEstimatedCents: number;
  paidAt: string | null;
}

export interface DossierDocument extends DocListItem {
  paymentRequests: DossierPaymentRequest[];
}

export type CurrencyTotals = Record<string, { contractedCents: number; paidCents: number }>;

export interface ProjectDossier {
  documents: DossierDocument[];
  totals: CurrencyTotals;
  byCounterparty: {
    counterpartyId: string | null;
    counterpartyName: string;
    documents: DossierDocument[];
    totals: CurrencyTotals;
  }[];
}

export interface CounterpartyDossier {
  documents: DossierDocument[];
  totals: CurrencyTotals;
  requisiteChanges: { field: string; label: string; onLastAct: string; inRegistry: string }[];
}

export function getProjectDossier(projectId: string): Promise<ProjectDossier> {
  return api<ProjectDossier>(`/api/docs/dossier/project/${projectId}`);
}

export function getCounterpartyDossier(id: string): Promise<CounterpartyDossier> {
  return api<CounterpartyDossier>(`/api/docs/dossier/counterparty/${id}`);
}

/** Adresa exportului: aceleași filtre ca lista, ca fișierul să conțină exact ce se vede. */
export function registerExportUrl(filters: DocFilters = {}): string {
  const qs = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v != null && v !== "") as [string, string][]
  ).toString();
  return `/api/docs/export/register.xlsx${qs ? `?${qs}` : ""}`;
}
