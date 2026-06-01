/**
 * SCHOOL-007 — Client API pentru portalul de părinți
 */
import { api } from "../api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChildSummary {
  id: string;
  fullName: string;
  classId: string | null;
  className: string | null;
}

export interface ParentGradeEntry {
  id: string;
  subjectId: string;
  subjectName: string | null;
  value: string;
  weight: string;
  type: string;
  title: string | null;
  gradedAt: string;
  notes: string | null;
  termId: string;
}

export interface ParentAttendanceEntry {
  id: string;
  date: string | null;
  status: string;
  reason: string | null;
}

export interface TuitionPlanSummary {
  id: string;
  planId: string;
  planName: string | null;
  amountCents: number | null;
  currency: string | null;
  billingCycle: string | null;
  siblingRank: number;
  scholarshipAmountCents: number;
  scholarshipPercent: string;
}

export interface TuitionInstallment {
  id: string;
  planId: string;
  dueDate: string;
  amountCents: number;
  orderIndex: number;
}

export interface NewsPost {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  authorName: string | null;
}

// ─── Functions ────────────────────────────────────────────────────────────────

export async function listChildren(): Promise<{ children: ChildSummary[] }> {
  return api<{ children: ChildSummary[] }>("/api/parent/children");
}

export async function listChildGrades(
  studentId: string,
  termId?: string
): Promise<{ grades: ParentGradeEntry[] }> {
  const qs = termId ? `?termId=${encodeURIComponent(termId)}` : "";
  return api<{ grades: ParentGradeEntry[] }>(`/api/parent/children/${studentId}/grades${qs}`);
}

export async function listChildAttendance(
  studentId: string
): Promise<{ attendance: ParentAttendanceEntry[] }> {
  return api<{ attendance: ParentAttendanceEntry[] }>(
    `/api/parent/children/${studentId}/attendance`
  );
}

export async function listChildTuition(studentId: string): Promise<{
  plan: TuitionPlanSummary | null;
  installments: TuitionInstallment[];
}> {
  return api<{ plan: TuitionPlanSummary | null; installments: TuitionInstallment[] }>(
    `/api/parent/children/${studentId}/tuition`
  );
}

export async function listParentNews(): Promise<{ news: NewsPost[] }> {
  return api<{ news: NewsPost[] }>("/api/parent/news");
}

export async function createNewsPost(payload: {
  title: string;
  body: string;
  publishedAt?: string | null;
}): Promise<{ newsPost: NewsPost }> {
  return api<{ newsPost: NewsPost }>("/api/school/news", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
