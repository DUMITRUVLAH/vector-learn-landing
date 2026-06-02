/**
 * SCHOOL-002 — Client API pentru gradebook (catalog de note)
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchoolSubject {
  id: string;
  tenantId: string;
  name: string;
  code: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export type GradeType = "test" | "homework" | "oral" | "final";

export interface GradeEntry {
  id: string;
  tenantId: string;
  classId: string;
  studentId: string;
  subjectId: string;
  termId: string;
  teacherId: string | null;
  value: string; // numeric comes as string from Drizzle
  weight: string;
  type: GradeType;
  title: string | null;
  gradedAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectAverage {
  subjectId: string;
  subjectName: string;
  average: number | null;
}

export interface ReportCardEntry {
  subjectId: string;
  subjectName: string;
  teacherName: string | null;
  average: number | null;
  grades: {
    title: string | null;
    value: number;
    weight: number;
    type: string;
    gradedAt: string;
  }[];
}

export interface ReportCardData {
  studentId: string;
  studentName: string;
  className: string;
  termName: string;
  subjects: ReportCardEntry[];
  overallAverage: number | null;
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CreateSubjectPayload {
  name: string;
  code?: string | null;
  description?: string | null;
}

export interface CreateGradePayload {
  classId: string;
  studentId: string;
  subjectId: string;
  termId: string;
  teacherId?: string | null;
  value: number;
  weight?: number;
  type?: GradeType;
  title?: string | null;
  gradedAt: string;
  notes?: string | null;
}

// ─── API Functions ────────────────────────────────────────────────────────────

/** Listează materiile tenantului. */
export async function listSubjects(): Promise<SchoolSubject[]> {
  const data = await api<{ subjects: SchoolSubject[] }>("/api/school/subjects");
  return data.subjects;
}

/** Creează o materie nouă. */
export async function createSubject(payload: CreateSubjectPayload): Promise<SchoolSubject> {
  const data = await api<{ subject: SchoolSubject }>("/api/school/subjects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.subject;
}

/** Actualizează o materie. */
export async function updateSubject(
  id: string,
  payload: Partial<CreateSubjectPayload>
): Promise<SchoolSubject> {
  const data = await api<{ subject: SchoolSubject }>(`/api/school/subjects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.subject;
}

/** Șterge o materie. */
export async function deleteSubject(id: string): Promise<void> {
  await api(`/api/school/subjects/${id}`, { method: "DELETE" });
}

/** Listează notele (filtrat). Limit ≤ 100. */
export async function listGrades(params: {
  classId?: string;
  termId?: string;
  subjectId?: string;
  limit?: number;
}): Promise<GradeEntry[]> {
  const qs = new URLSearchParams();
  if (params.classId) qs.set("classId", params.classId);
  if (params.termId) qs.set("termId", params.termId);
  if (params.subjectId) qs.set("subjectId", params.subjectId);
  qs.set("limit", String(Math.min(params.limit ?? 50, 100)));
  const data = await api<{ grades: GradeEntry[] }>(`/api/school/grades?${qs.toString()}`);
  return data.grades;
}

/** Creează o notă. */
export async function createGrade(payload: CreateGradePayload): Promise<GradeEntry> {
  const data = await api<{ grade: GradeEntry }>("/api/school/grades", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.grade;
}

/** Actualizează o notă. */
export async function updateGrade(
  id: string,
  payload: Partial<Omit<CreateGradePayload, "classId" | "studentId" | "subjectId" | "termId">>
): Promise<GradeEntry> {
  const data = await api<{ grade: GradeEntry }>(`/api/school/grades/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data.grade;
}

/** Șterge o notă. */
export async function deleteGrade(id: string): Promise<void> {
  await api(`/api/school/grades/${id}`, { method: "DELETE" });
}

/** Notele unui elev (opțional filtrat pe termen), cu media per materie. */
export async function getStudentGrades(
  studentId: string,
  termId?: string
): Promise<{ grades: GradeEntry[]; averagePerSubject: SubjectAverage[] }> {
  const qs = termId ? `?termId=${termId}` : "";
  return api<{ grades: GradeEntry[]; averagePerSubject: SubjectAverage[] }>(
    `/api/school/grades/student/${studentId}${qs}`
  );
}

/** Date complete pentru fișa de situație a unui elev. */
export async function getReportCard(
  studentId: string,
  termId: string
): Promise<ReportCardData> {
  const data = await api<{ reportCard: ReportCardData }>(
    `/api/school/grades/report-card/${studentId}/${termId}`
  );
  return data.reportCard;
}
