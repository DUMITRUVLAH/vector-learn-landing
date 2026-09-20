/**
 * CRM — clientul tipat pentru importul de lead-uri.
 *
 * Fișierul se citește în browser doar ca TEXT; parsarea, maparea, validarea și
 * dedup-ul se fac pe server. Motivul e simplu: previzualizarea și importul
 * trebuie să fie același verdict, iar asta se garantează cel mai sigur rulând
 * literalmente același cod — nu două implementări care „ar trebui" să fie egale.
 */
import { api } from "@/lib/api";

export const IMPORT_TARGET_FIELDS = [
  "full_name",
  "phone",
  "email",
  "company",
  "idno",
  "interest_course",
  "value_cents",
  "source",
  "assigned_to",
  "stage",
  "industry",
  "region",
  "company_size",
  "annual_consumption_kwh",
  "notes",
  "deal_name",
  "tag",
  "ignore",
] as const;

export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number];

/** O coloană poate merge și într-un câmp personalizat al workspace-ului, scris `cf:<cheie>`. */
export const CUSTOM_FIELD_PREFIX = "cf:";
export type ImportTarget = ImportTargetField | `${typeof CUSTOM_FIELD_PREFIX}${string}`;

export function customFieldKeyOf(target: string): string | null {
  if (!target.startsWith(CUSTOM_FIELD_PREFIX)) return null;
  const key = target.slice(CUSTOM_FIELD_PREFIX.length).trim();
  return key.length > 0 ? key : null;
}

export const IMPORT_TARGET_LABELS: Record<ImportTargetField, string> = {
  full_name: "Nume complet",
  phone: "Telefon",
  email: "Email",
  company: "Companie",
  idno: "Cod fiscal (IDNO/CUI)",
  interest_course: "Produs de interes",
  value_cents: "Valoare oportunitate",
  source: "Sursă",
  assigned_to: "Responsabil",
  stage: "Etapă",
  industry: "Industrie (firmă)",
  region: "Regiune (firmă)",
  company_size: "Mărime firmă",
  annual_consumption_kwh: "Consum anual kWh (firmă)",
  notes: "Notițe",
  deal_name: "Denumire oportunitate",
  tag: "Etichetă",
  ignore: "— ignoră coloana —",
};

/** Câmpurile care se scriu pe fișa FIRMEI, nu pe lead — interfața le marchează ca atare. */
export const COMPANY_SCOPED_FIELDS: ImportTargetField[] = [
  "idno",
  "industry",
  "region",
  "company_size",
  "annual_consumption_kwh",
];

export type FieldMapping = Record<number, ImportTarget>;

/** Definiția unui câmp personalizat, așa cum o întoarce previzualizarea. */
export interface ImportCustomField {
  id: string;
  key: string;
  label: string;
}

/** Eticheta de afișat pentru orice țintă, fixă sau personalizată. */
export function targetLabel(target: string, customFields: readonly ImportCustomField[]): string {
  const key = customFieldKeyOf(target);
  if (key) return customFields.find((f) => f.key === key)?.label ?? key;
  return IMPORT_TARGET_LABELS[target as ImportTargetField] ?? target;
}
export type DuplicateStatus = "new" | "duplicate_in_file" | "duplicate_in_db";

export const DUPLICATE_LABELS: Record<DuplicateStatus, string> = {
  new: "Nou",
  duplicate_in_file: "Repetat în fișier",
  duplicate_in_db: "Există deja",
};

export interface ImportDraftLead {
  rowNumber: number;
  full_name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  value_cents: number | null;
  notes: string | null;
  [key: string]: unknown;
}

export interface ImportPreviewRow {
  rowNumber: number;
  draft: ImportDraftLead;
  status: DuplicateStatus;
  errors: string[];
  warnings: string[];
  resolved: {
    stage: string;
    stageLabel: string;
    source: string;
    assignedTo: string | null;
    assignedToName: string | null;
    companyName: string | null;
  };
}

export interface ImportCounts {
  total: number;
  valid: number;
  errors: number;
  duplicatesInFile: number;
  duplicatesInDb: number;
  /** Câte se scriu cu „sari peste duplicate" bifat — numărul de pe buton. */
  importableNew: number;
  /** Câte se scriu dacă omul cere explicit importul duplicatelor. */
  importableAll: number;
}

export interface ImportPreviewResponse {
  headers: string[];
  delimiter: "," | ";" | "\t";
  mapping: FieldMapping;
  counts: ImportCounts;
  stages: { key: string; label: string }[];
  owners: { id: string; name: string }[];
  customFields: ImportCustomField[];
  rows: ImportPreviewRow[];
  truncated: boolean;
}

export interface ImportRunResponse {
  jobId: string | null;
  created: number;
  skipped: number;
  counts: ImportCounts;
  details: { rowNumber: number; reason: string }[];
  /** Câte etichete și câte valori de câmp personalizat s-au scris odată cu lead-urile. */
  tagsWritten?: number;
  customValuesWritten?: number;
}

/** Creează un câmp personalizat pornind de la antetul unei coloane, fără drum prin Setări —
 *  altfel nimeni nu-l face, iar coloana se pierde la „ignoră". */
export function createCrmCustomField(body: { label: string }): Promise<ImportCustomField> {
  return api<ImportCustomField>("/api/crm/custom-fields", { method: "POST", body: JSON.stringify(body) });
}

export function previewCrmImport(body: {
  /** CSV/text lipit, sau registrul `.xlsx` codificat base64 (vezi `format`). */
  text: string;
  format?: "text" | "xlsx";
  delimiter?: string | null;
  mapping?: FieldMapping | null;
}): Promise<ImportPreviewResponse> {
  return api<ImportPreviewResponse>("/api/crm/import/preview", { method: "POST", body: JSON.stringify(body) });
}

export function runCrmImport(body: {
  text: string;
  format?: "text" | "xlsx";
  delimiter?: string | null;
  mapping?: FieldMapping | null;
  fileName?: string | null;
  skipDuplicates?: boolean;
}): Promise<ImportRunResponse> {
  return api<ImportRunResponse>("/api/crm/import/run", { method: "POST", body: JSON.stringify(body) });
}

export interface CrmImportJob {
  id: string;
  fileName: string | null;
  totalRows: number;
  createdCount: number;
  duplicateCount: number;
  errorCount: number;
  createdAt: string;
  createdByName: string | null;
}

export function listCrmImportJobs(): Promise<{ items: CrmImportJob[] }> {
  return api<{ items: CrmImportJob[] }>("/api/crm/import/jobs");
}

export interface CrmImportMapping {
  id: string;
  name: string;
  mapping: FieldMapping;
}

export function listCrmImportMappings(): Promise<{ items: CrmImportMapping[] }> {
  return api<{ items: CrmImportMapping[] }>("/api/crm/import/mappings");
}

export function saveCrmImportMapping(body: { name: string; mapping: FieldMapping }): Promise<CrmImportMapping> {
  return api<CrmImportMapping>("/api/crm/import/mappings", { method: "POST", body: JSON.stringify(body) });
}

export function deleteCrmImportMapping(id: string): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/crm/import/mappings/${id}`, { method: "DELETE" });
}
