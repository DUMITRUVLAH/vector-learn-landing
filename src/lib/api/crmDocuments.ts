/**
 * CRM — oferte și contracte pornite dintr-un lead.
 *
 * Clientul ăsta creează și listează. Editarea, finalizarea, descărcarea PDF și
 * trimiterea pe email rămân în ecranul de acte al FinFlow (`docPath(id)`) —
 * acolo e motorul, acolo sunt toate regulile. CRM-ul doar deschide ușa.
 */
import { api } from "@/lib/api";

export type CrmDocKind = "oferta_comerciala" | "contract_servicii" | "act_primire_predare";

export const CRM_DOC_KIND_LABELS: Record<CrmDocKind, string> = {
  oferta_comerciala: "Ofertă comercială",
  contract_servicii: "Contract",
  act_primire_predare: "Act de primire-predare",
};

export const CRM_DOC_STATUS_LABELS: Record<string, string> = {
  draft: "Ciornă",
  pending_approval: "La aprobare",
  final: "Finalizat",
  sent: "Trimis",
  signed: "Semnat",
  rejected: "Refuzat",
  cancelled: "Anulat",
};

export interface CrmDocument {
  id: string;
  kind: string;
  docNumber: string | null;
  docDate: string;
  title: string;
  status: string;
  totalCents: number;
  currency: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  finalizedAt: string | null;
  cancelledAt: string | null;
  /** Când a plecat la client — se scrie singur la trimiterea pe e-mail. */
  sentAt?: string | null;
  /** Când clientul a semnat sau a refuzat. */
  outcomeAt?: string | null;
  /** De ce a refuzat — obligatoriu la refuz. */
  outcomeReason?: string | null;
}

/**
 * Ce a răspuns clientul (cerințele 42 și 45). „Trimis" îl știe sistemul; asta o știe doar omul
 * care a vorbit cu el, deci se marchează manual. La refuz, motivul e obligatoriu.
 */
export function setCrmDocumentOutcome(
  documentId: string,
  body: { status: "signed" | "rejected"; reason?: string }
): Promise<CrmDocument> {
  return api<CrmDocument>(`/api/docs/documents/${documentId}/outcome`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listCrmDocuments(leadId?: string | null): Promise<{ items: CrmDocument[] }> {
  const qs = leadId ? `?leadId=${encodeURIComponent(leadId)}` : "";
  return api<{ items: CrmDocument[] }>(`/api/crm/documents${qs}`);
}

export interface CreateCrmDocumentBody {
  leadId: string;
  kind?: CrmDocKind;
  templateId?: string | null;
  title?: string | null;
  currency?: string;
  items?: { productId: string; quantity: number; unitPriceCents?: number | null }[];
  extraLines?: {
    description: string;
    unit?: string;
    quantity: number;
    unitPriceCents: number;
    vatPercent?: number;
  }[];
  basedOn?: string | null;
}

/** Răspunde 400 `currency_mismatch` dacă produsele alese sunt în monede diferite. */
export function createCrmDocument(body: CreateCrmDocumentBody): Promise<CrmDocument & { missing?: string[] }> {
  return api<CrmDocument & { missing?: string[] }>("/api/crm/documents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
