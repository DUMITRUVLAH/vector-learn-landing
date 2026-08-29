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
