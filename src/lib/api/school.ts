/**
 * SCHOOL-001 — Client API pentru modulul de școală
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AcademicYear {
  id: string;
  tenantId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AcademicTerm {
  id: string;
  tenantId: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolClass {
  id: string;
  tenantId: string;
  academicYearId: string;
  name: string;
  gradeLevel: string;
  section: string | null;
  homeroomTeacherId: string | null;
  homeroomTeacherName: string | null;
  capacity: number | null;
  enrollmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClassEnrollment {
  id: string;
  tenantId: string;
  classId: string;
  studentId: string;
  enrolledAt: string;
  status: "active" | "transferred" | "withdrawn";
  createdAt: string;
  updatedAt: string;
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CreateYearPayload {
  name: string;
  startDate: string;
  endDate: string;
  isCurrent?: boolean;
}

export interface CreateTermPayload {
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  orderIndex?: number;
}

export interface CreateClassPayload {
  academicYearId: string;
  name: string;
  gradeLevel: string;
  section?: string | null;
  homeroomTeacherId?: string | null;
  capacity?: number | null;
}

// ─── Academic Years ───────────────────────────────────────────────────────────

export async function listAcademicYears(): Promise<{ years: AcademicYear[] }> {
  return api<{ years: AcademicYear[] }>("/api/school/years");
}

export async function createAcademicYear(payload: CreateYearPayload): Promise<{ year: AcademicYear }> {
  return api<{ year: AcademicYear }>("/api/school/years", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchAcademicYear(
  id: string,
  payload: Partial<CreateYearPayload>
): Promise<{ year: AcademicYear }> {
  return api<{ year: AcademicYear }>(`/api/school/years/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAcademicYear(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/school/years/${id}`, { method: "DELETE" });
}

// ─── Academic Terms ───────────────────────────────────────────────────────────

export async function listAcademicTerms(yearId?: string): Promise<{ terms: AcademicTerm[] }> {
  const qs = yearId ? `?yearId=${encodeURIComponent(yearId)}` : "";
  return api<{ terms: AcademicTerm[] }>(`/api/school/terms${qs}`);
}

export async function createAcademicTerm(payload: CreateTermPayload): Promise<{ term: AcademicTerm }> {
  return api<{ term: AcademicTerm }>("/api/school/terms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchAcademicTerm(
  id: string,
  payload: Partial<CreateTermPayload>
): Promise<{ term: AcademicTerm }> {
  return api<{ term: AcademicTerm }>(`/api/school/terms/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteAcademicTerm(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/school/terms/${id}`, { method: "DELETE" });
}

// ─── School Classes ───────────────────────────────────────────────────────────

export async function listSchoolClasses(yearId?: string): Promise<{ classes: SchoolClass[] }> {
  const qs = yearId ? `?yearId=${encodeURIComponent(yearId)}` : "";
  return api<{ classes: SchoolClass[] }>(`/api/school/classes${qs}`);
}

export async function createSchoolClass(payload: CreateClassPayload): Promise<{ class: SchoolClass }> {
  return api<{ class: SchoolClass }>("/api/school/classes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchSchoolClass(
  id: string,
  payload: Partial<CreateClassPayload>
): Promise<{ class: SchoolClass }> {
  return api<{ class: SchoolClass }>(`/api/school/classes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteSchoolClass(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/school/classes/${id}`, { method: "DELETE" });
}

// ─── Enrollment ───────────────────────────────────────────────────────────────

export async function enrollStudent(
  classId: string,
  studentId: string
): Promise<{ enrollment: ClassEnrollment }> {
  return api<{ enrollment: ClassEnrollment }>(`/api/school/classes/${classId}/enroll`, {
    method: "POST",
    body: JSON.stringify({ studentId }),
  });
}

export async function withdrawStudent(
  classId: string,
  studentId: string
): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/school/classes/${classId}/enroll/${studentId}`, {
    method: "DELETE",
  });
}
