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
  /** Câte oportunități (lead-uri) are firma. Lipsește doar din răspunsurile de creare/editare. */
  leadCount?: number;
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

// ─── Fișa clientului ─────────────────────────────────────────────────────────

export type CrmDealOutcome = "open" | "won" | "lost";

export interface CrmCompanyOverview {
  company: CrmCompany & { updatedAt: string };
  stats: {
    deals: number;
    openDeals: number;
    openValueCents: number;
    wonValueCents: number;
    lastActivityAt: string | null;
  };
  deals: {
    id: string;
    fullName: string;
    dealName: string | null;
    stage: string;
    stageLabel: string;
    outcome: CrmDealOutcome;
    pipelineName: string | null;
    valueCents: number | null;
    ownerName: string | null;
    updatedAt: string;
  }[];
  contacts: {
    id: string;
    leadId: string;
    fullName: string;
    role: string | null;
    phone: string | null;
    email: string | null;
    isPrimary: boolean;
    leadName: string | null;
  }[];
  tasks: { id: string; leadId: string; title: string; dueAt: string | null; leadName: string | null }[];
  documents: {
    id: string;
    leadId: string | null;
    kind: string;
    docNumber: string | null;
    title: string;
    status: string;
    totalCents: number;
    currency: string;
    createdAt: string;
    leadName: string | null;
  }[];
  activity: {
    id: string;
    leadId: string;
    type: string;
    direction: string;
    body: string | null;
    occurredAt: string;
    userName: string | null;
    leadName: string | null;
  }[];
}

export function getCrmCompanyOverview(id: string): Promise<CrmCompanyOverview> {
  return api<CrmCompanyOverview>(`/api/crm/companies/${encodeURIComponent(id)}/overview`);
}

// ─── Import de firme ─────────────────────────────────────────────────────────

export const COMPANY_IMPORT_TARGETS = [
  "name",
  "idno",
  "industry",
  "region",
  "company_size",
  "annual_consumption_kwh",
  "website",
  "phone",
  "email",
  "address",
  "notes",
  "ignore",
] as const;

export type CompanyImportTarget = (typeof COMPANY_IMPORT_TARGETS)[number];
export type CompanyFieldMapping = Record<number, CompanyImportTarget>;

export const COMPANY_IMPORT_LABELS: Record<CompanyImportTarget, string> = {
  name: "Denumirea firmei",
  idno: "Cod fiscal (IDNO/CUI)",
  industry: "Industrie",
  region: "Regiune",
  company_size: "Mărime",
  annual_consumption_kwh: "Consum anual kWh",
  website: "Site web",
  phone: "Telefon",
  email: "Email",
  address: "Adresă",
  notes: "Notițe (se pot aduna mai multe coloane)",
  ignore: "— ignoră coloana —",
};

export type CompanyExistingMode = "skip" | "fill" | "overwrite";
export type CompanyImportStatus = "new" | "exists" | "duplicate_in_file" | "error";

export interface CompanyImportDraft {
  rowNumber: number;
  name: string;
  idno: string | null;
  industry: string | null;
  region: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  [key: string]: unknown;
}

export interface CompanyImportPreview {
  headers: string[];
  delimiter: string | null;
  sheetNames: string[];
  /** Primele rânduri brute, ca omul să vadă unde începe tabelul. */
  topRows: string[][];
  /** Primele rânduri de după antet, brute — exemplele din dreptul fiecărei coloane. */
  sampleRows: string[][];
  mapping: CompanyFieldMapping;
  counts: { total: number; new: number; exists: number; duplicatesInFile: number; errors: number };
  rows: {
    draft: CompanyImportDraft;
    status: CompanyImportStatus;
    errors: string[];
    warnings: string[];
    existingId: string | null;
  }[];
  truncated: boolean;
}

export interface CompanyImportRequest {
  text: string;
  format: "text" | "xlsx";
  sheet?: number;
  headerRow?: number;
  mapping?: CompanyFieldMapping | null;
  existingMode?: CompanyExistingMode;
  fileName?: string | null;
}

export interface CompanyImportResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  details: { rowNumber: number; reason: string }[];
}

export function previewCrmCompanyImport(body: CompanyImportRequest): Promise<CompanyImportPreview> {
  return api<CompanyImportPreview>("/api/crm/companies/import/preview", { method: "POST", body: JSON.stringify(body) });
}

export function runCrmCompanyImport(body: CompanyImportRequest): Promise<CompanyImportResult> {
  return api<CompanyImportResult>("/api/crm/companies/import/run", { method: "POST", body: JSON.stringify(body) });
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
