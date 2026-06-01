/**
 * DIPLOMA-802 — Certificate templates API client
 *
 * Wraps /api/certificate-templates (DIPLOMA-801 backend).
 */

export type FieldConfig = {
  x: number;
  y: number;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  align?: "left" | "center" | "right";
  maxWidth?: number;
  size?: number;
  bold?: boolean;
};

export type FieldsConfig = {
  participant_name?: FieldConfig;
  course_name?: FieldConfig;
  edition?: FieldConfig;
  mentor_name?: FieldConfig;
  completion_date?: FieldConfig;
  qr_code?: FieldConfig & { size?: number };
  certificate_id?: FieldConfig;
  [key: string]: FieldConfig | undefined;
};

export interface CertificateTemplate {
  id: string;
  tenantId: string;
  courseId: string | null;
  cohortId: string | null;
  name: string;
  backgroundUrl: string | null;
  fieldsConfig: FieldsConfig | null;
  isGlobal: boolean;
  createdAt: string;
  updatedAt: string;
}

const BASE = "/api/certificate-templates";

export async function listCertificateTemplates(params?: {
  courseId?: string;
  cohortId?: string;
}): Promise<{ templates: CertificateTemplate[] }> {
  const qs = new URLSearchParams();
  if (params?.courseId) qs.set("courseId", params.courseId);
  if (params?.cohortId) qs.set("cohortId", params.cohortId);
  const url = qs.size > 0 ? `${BASE}?${qs}` : BASE;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`certificate-templates: ${res.status}`);
  return res.json() as Promise<{ templates: CertificateTemplate[] }>;
}

export async function getCertificateTemplate(id: string): Promise<{ template: CertificateTemplate }> {
  const res = await fetch(`${BASE}/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`certificate-templates get: ${res.status}`);
  return res.json() as Promise<{ template: CertificateTemplate }>;
}

export async function createCertificateTemplate(body: {
  name: string;
  courseId?: string | null;
  cohortId?: string | null;
  backgroundUrl?: string | null;
  fieldsConfig?: Record<string, unknown> | null;
  isGlobal?: boolean;
}): Promise<{ template: CertificateTemplate }> {
  const res = await fetch(BASE, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`certificate-templates create: ${res.status}`);
  return res.json() as Promise<{ template: CertificateTemplate }>;
}

export async function patchCertificateTemplate(
  id: string,
  body: Partial<{
    name: string;
    courseId: string | null;
    cohortId: string | null;
    backgroundUrl: string | null;
    fieldsConfig: Record<string, unknown> | null;
    isGlobal: boolean;
  }>
): Promise<{ template: CertificateTemplate }> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`certificate-templates patch: ${res.status}`);
  return res.json() as Promise<{ template: CertificateTemplate }>;
}
