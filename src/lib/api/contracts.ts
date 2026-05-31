/**
 * CONTRACT-501 — Client-side API helpers for /api/contracts
 */
import { api } from "../api";

export type BeneficiaryType = "pf" | "pj";
export type ContractFormat = "fizic" | "online";
export type ContractCurrency = "MDL" | "EUR" | "RON";

export interface Contract {
  id: string;
  tenantId: string;
  number: string;
  prefix: string;
  dailySeq: number;
  contractDate: string;
  beneficiaryType: BeneficiaryType;
  beneficiaryName: string | null;
  idn: string | null;
  companyName: string | null;
  companyIdno: string | null;
  repName: string | null;
  repRole: string | null;
  course: string | null;
  hours: number | null;
  scheduleText: string | null;
  language: string | null;
  format: ContractFormat | null;
  location: string | null;
  priceCents: number;
  currency: ContractCurrency;
  persons: number;
  leadId: string | null;
  studentId: string | null;
  pdfUrl: string | null;
  data: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContractPayload {
  beneficiaryType: BeneficiaryType;
  beneficiaryName?: string | null;
  idn?: string | null;
  companyName?: string | null;
  companyIdno?: string | null;
  repName?: string | null;
  repRole?: string | null;
  course?: string | null;
  hours?: number | null;
  scheduleText?: string | null;
  language?: string | null;
  format?: ContractFormat | null;
  location?: string | null;
  priceCents?: number;
  currency?: ContractCurrency;
  persons?: number;
  leadId?: string | null;
  studentId?: string | null;
}

export interface OcrResult {
  beneficiaryName: string | null;
  idn: string | null;
  companyName: string | null;
  companyIdno: string | null;
  note: string | null;
}

export async function listContracts(opts?: {
  limit?: number;
  offset?: number;
}): Promise<{ contracts: Contract[] }> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const qs = params.toString();
  return api<{ contracts: Contract[] }>(`/api/contracts${qs ? `?${qs}` : ""}`);
}

export async function createContract(
  payload: CreateContractPayload
): Promise<{ contract: Contract }> {
  return api<{ contract: Contract }>("/api/contracts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getContract(id: string): Promise<{ contract: Contract }> {
  return api<{ contract: Contract }>(`/api/contracts/${id}`);
}

export function getContractPdfUrl(id: string): string {
  return `/api/contracts/${id}/pdf`;
}

export async function uploadOcr(
  file: File
): Promise<{ ocr: OcrResult }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/contracts/ocr", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) throw new Error(`OCR request failed: ${res.status}`);
  return res.json() as Promise<{ ocr: OcrResult }>;
}
