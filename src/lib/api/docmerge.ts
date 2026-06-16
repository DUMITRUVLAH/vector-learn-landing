/**
 * DOCMERGE-001: API client for Document Merge module.
 * DB-portability: zero .execute().rows — uses query builder.
 */
import { api } from "@/lib/api";

export interface DocmergeTemplate {
  id: string;
  name: string;
  placeholders: string[];
  sourceFormat: string;
  updatedAt: string;
}

export interface DocmergeTemplateFull extends DocmergeTemplate {
  bodyHtml: string;
  tenantId: string;
  createdAt: string;
}

export interface CreateTemplateBody {
  name: string;
  bodyHtml: string;
}

export interface UpdateTemplateBody {
  name?: string;
  bodyHtml?: string;
}

export interface PreviewTemplateBody {
  context?: Record<string, string>;
}

export interface PreviewTemplateResponse {
  html: string;
}

export function listTemplates(): Promise<DocmergeTemplate[]> {
  return api<DocmergeTemplate[]>("/api/docmerge/templates");
}

export function getTemplate(id: string): Promise<DocmergeTemplateFull> {
  return api<DocmergeTemplateFull>(`/api/docmerge/templates/${id}`);
}

export function createTemplate(
  body: CreateTemplateBody
): Promise<{ id: string; name: string; placeholders: string[]; createdAt: string }> {
  return api("/api/docmerge/templates", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateTemplate(
  id: string,
  body: UpdateTemplateBody
): Promise<DocmergeTemplateFull> {
  return api(`/api/docmerge/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteTemplate(id: string): Promise<{ ok: boolean }> {
  return api(`/api/docmerge/templates/${id}`, { method: "DELETE" });
}

export function previewTemplate(
  id: string,
  body?: PreviewTemplateBody
): Promise<PreviewTemplateResponse> {
  return api(`/api/docmerge/templates/${id}/preview`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

// ─── DOCMERGE-002: Excel Import ───────────────────────────────────────────────

export interface ParsedExcelResult {
  headers: string[];
  sample: Record<string, string>[];
  previewRows: Record<string, string>[];
  rowCount: number;
}

export interface AutoMapResult {
  mapping: Record<string, string>;
}

/**
 * Upload an .xlsx file for parsing. Returns headers + preview rows.
 * NOTE: uses FormData, not JSON — api() is called differently here.
 */
export async function parseExcel(file: File): Promise<ParsedExcelResult> {
  const form = new FormData();
  form.append("file", file);
  return api<ParsedExcelResult>("/api/docmerge/parse-excel", {
    method: "POST",
    body: form,
    // No Content-Type header — browser sets multipart boundary automatically
  });
}

export function autoMapColumns(
  headers: string[],
  placeholders: string[]
): Promise<AutoMapResult> {
  return api<AutoMapResult>("/api/docmerge/automap", {
    method: "POST",
    body: JSON.stringify({ headers, placeholders }),
  });
}
