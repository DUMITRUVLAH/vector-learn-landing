/**
 * TRUST-003: FinDesk GDPR API client
 */
import { api } from "../api";

export interface GdprExportPayload {
  exportedAt: string;
  gdprBasis: string;
  subject: string;
  subjectId: string;
  profile: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    parentPhone: string | null;
    parentEmail: string | null;
    birthDate: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  consents: unknown[];
  aiLog: unknown[];
}

export interface AnonymizeResponse {
  anonymized: number;
}

export interface DataSettingsPatch {
  pseudonymizeAiPrompts?: boolean;
  aiLogRetentionDays?: number;
  aiOptIn?: boolean;
  retentionDaysStudents?: number;
}

export interface DataSettings {
  id: string;
  tenantId: string;
  pseudonymizeAiPrompts: boolean;
  aiLogRetentionDays: number;
  aiOptIn: boolean;
  retentionDaysStudents: number;
  createdAt: string;
  updatedAt: string;
}

export async function exportGdprData(studentId: string): Promise<GdprExportPayload> {
  return api<GdprExportPayload>(`/api/fin/gdpr/export/${studentId}`);
}

export async function anonymizeOldStudents(): Promise<AnonymizeResponse> {
  return api<AnonymizeResponse>("/api/fin/gdpr/anonymize-old", {
    method: "POST",
  });
}

export async function getDataSettings(): Promise<DataSettings> {
  return api<DataSettings>("/api/fin/data-settings");
}

export async function patchDataSettings(patch: DataSettingsPatch): Promise<DataSettings> {
  return api<DataSettings>("/api/fin/data-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

/**
 * Trigger browser download of GDPR export JSON for a student.
 */
export async function downloadGdprExport(studentId: string): Promise<void> {
  const res = await fetch(`/api/fin/gdpr/export/${studentId}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gdpr-export-${studentId}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
