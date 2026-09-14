/**
 * CRM — clientul tipat pentru firme și pentru unificarea duplicatelor.
 *
 * O unificare mută istoricul a două fișe într-una singură și NU se poate
 * desface dintr-un buton. De aceea clientul expune întâi `previewMerge` — care
 * nu scrie nimic — și abia apoi `mergeCrmLeads`. Interfața n-are voie să sară
 * peste primul pas.
 */
import { api } from "@/lib/api";

export interface CrmCompany {
  id: string;
  name: string;
  idno: string | null;
  industry: string | null;
  region: string | null;
  companySize: string | null;
  annualConsumptionKwh: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
}

export function listCrmCompanies(search = ""): Promise<{ items: CrmCompany[] }> {
  const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return api<{ items: CrmCompany[] }>(`/api/crm/companies${qs}`);
}

export interface CrmCompanyInput {
  name: string;
  idno?: string | null;
  industry?: string | null;
  region?: string | null;
  companySize?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export function createCrmCompany(body: CrmCompanyInput): Promise<CrmCompany> {
  return api<CrmCompany>("/api/crm/companies", { method: "POST", body: JSON.stringify(body) });
}

export function updateCrmCompany(id: string, body: Partial<CrmCompanyInput>): Promise<CrmCompany> {
  return api<CrmCompany>(`/api/crm/companies/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export interface CrmCompanyLead {
  id: string;
  fullName: string;
  stage: string;
  valueCents: number;
  createdAt: string;
}

export function listCrmCompanyLeads(id: string): Promise<{ items: CrmCompanyLead[] }> {
  return api<{ items: CrmCompanyLead[] }>(`/api/crm/companies/${id}/leads`);
}

// ─── Duplicate ───────────────────────────────────────────────────────────────

export interface CrmDuplicateRecord {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  stage: string;
  valueCents: number;
  assignedTo: string | null;
  notes: string | null;
}

export interface CrmDuplicateCluster {
  score: number;
  reasons: string[];
  records: CrmDuplicateRecord[];
}

export function listCrmDuplicates(): Promise<{ clusters: CrmDuplicateCluster[] }> {
  return api<{ clusters: CrmDuplicateCluster[] }>("/api/crm/companies/duplicates");
}

export interface CrmFieldDecision {
  field: string;
  value: unknown;
  keep: "primary" | "duplicate";
  from?: string;
}

export interface CrmMergePlan {
  primaryId: string;
  duplicateIds: string[];
  fields: CrmFieldDecision[];
  valueCentsTotal: number;
  debtCentsTotal: number;
  reparented: { table: string; count: number }[];
  keptTags: { tag: string }[];
  droppedTags: { tag: string }[];
}

/** Nu scrie nimic — doar spune ce s-ar întâmpla. */
export function previewCrmMerge(body: { primaryId: string; duplicateIds: string[] }): Promise<{ plan: CrmMergePlan }> {
  return api<{ plan: CrmMergePlan }>("/api/crm/companies/merge/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function mergeCrmLeads(body: { primaryId: string; duplicateIds: string[] }): Promise<{ ok: true }> {
  return api<{ ok: true }>("/api/crm/companies/merge", { method: "POST", body: JSON.stringify(body) });
}

/** Etichete în română pentru câmpurile din planul de unificare. */
export const MERGE_FIELD_LABELS: Record<string, string> = {
  fullName: "Nume",
  phone: "Telefon",
  email: "Email",
  company: "Firmă",
  companyId: "Fișa firmei",
  dealName: "Denumire oportunitate",
  interestCourse: "Produs de interes",
  stage: "Etapă",
  assignedTo: "Responsabil",
  lostReason: "Motiv pierdere",
  notes: "Notițe",
};
