/**
 * SCHOOL-005 — Client API pentru dosarul de admitere
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdmissionStatus =
  | "draft"
  | "submitted"
  | "review"
  | "accepted"
  | "waitlisted"
  | "rejected"
  | "enrolled";

export type AdmissionDocStatus = "required" | "received" | "verified";

export interface AdmissionApplication {
  id: string;
  tenantId: string;
  academicYearId: string;
  applicantName: string;
  applicantEmail: string | null;
  applicantPhone: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  gradeLevel: string;
  status: AdmissionStatus;
  leadId: string | null;
  decisionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdmissionDocument {
  id: string;
  tenantId: string;
  applicationId: string;
  name: string;
  status: AdmissionDocStatus;
  uploadedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CreateApplicationPayload {
  academicYearId: string;
  applicantName: string;
  applicantEmail?: string | null;
  applicantPhone?: string | null;
  guardianName?: string | null;
  guardianPhone?: string | null;
  gradeLevel: string;
  leadId?: string | null;
}

export interface CreateDocumentPayload {
  name: string;
  status?: AdmissionDocStatus;
  notes?: string | null;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function listApplications(params: {
  yearId?: string;
  status?: AdmissionStatus;
} = {}): Promise<AdmissionApplication[]> {
  const qs = new URLSearchParams();
  if (params.yearId) qs.set("yearId", params.yearId);
  if (params.status) qs.set("status", params.status);
  const data = await api<{ applications: AdmissionApplication[] }>(
    `/api/school/admissions${qs.toString() ? `?${qs.toString()}` : ""}`
  );
  return data.applications;
}

export async function createApplication(
  payload: CreateApplicationPayload
): Promise<AdmissionApplication> {
  const data = await api<{ application: AdmissionApplication }>("/api/school/admissions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.application;
}

export async function updateApplication(
  id: string,
  payload: Partial<{
    status: AdmissionStatus;
    decisionNotes: string | null;
    applicantName: string;
    applicantEmail: string | null;
    applicantPhone: string | null;
    guardianName: string | null;
    guardianPhone: string | null;
    gradeLevel: string;
  }>
): Promise<AdmissionApplication> {
  const data = await api<{ application: AdmissionApplication }>(
    `/api/school/admissions/${id}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
  return data.application;
}

export async function deleteApplication(id: string): Promise<void> {
  await api(`/api/school/admissions/${id}`, { method: "DELETE" });
}

export async function listDocuments(applicationId: string): Promise<AdmissionDocument[]> {
  const data = await api<{ documents: AdmissionDocument[] }>(
    `/api/school/admissions/${applicationId}/documents`
  );
  return data.documents;
}

export async function addDocument(
  applicationId: string,
  payload: CreateDocumentPayload
): Promise<AdmissionDocument> {
  const data = await api<{ document: AdmissionDocument }>(
    `/api/school/admissions/${applicationId}/documents`,
    { method: "POST", body: JSON.stringify(payload) }
  );
  return data.document;
}

export async function updateDocument(
  applicationId: string,
  documentId: string,
  payload: Partial<CreateDocumentPayload>
): Promise<AdmissionDocument> {
  const data = await api<{ document: AdmissionDocument }>(
    `/api/school/admissions/${applicationId}/documents/${documentId}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
  return data.document;
}

export async function enrollApplication(
  applicationId: string,
  payload: { classId?: string | null; studentId?: string | null }
): Promise<{ studentId: string; enrollmentId: string | null }> {
  return api<{ studentId: string; enrollmentId: string | null }>(
    `/api/school/admissions/${applicationId}/enroll`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}
