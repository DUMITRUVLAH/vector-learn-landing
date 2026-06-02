/**
 * GAP-006: Lesson packages API client
 */
import { api } from "../api";

export type LessonPackageStatus = "active" | "exhausted" | "expired" | "cancelled";

export interface LessonPackage {
  id: string;
  tenantId: string;
  studentId: string;
  courseId: string;
  invoiceId: string | null;
  unitsTotal: number;
  unitsRemaining: number;
  autoRenew: boolean;
  recoveryIncludedInPackage: boolean;
  validFrom: string; // ISO date
  validUntil: string | null;
  status: LessonPackageStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ListPackagesParams {
  studentId?: string;
  courseId?: string;
  status?: LessonPackageStatus;
}

export async function listLessonPackages(params: ListPackagesParams = {}): Promise<{ items: LessonPackage[] }> {
  const q = new URLSearchParams();
  if (params.studentId) q.set("studentId", params.studentId);
  if (params.courseId) q.set("courseId", params.courseId);
  if (params.status) q.set("status", params.status);
  const qs = q.toString();
  return api<{ items: LessonPackage[] }>(`/api/lesson-packages${qs ? `?${qs}` : ""}`);
}

export async function getLessonPackage(id: string): Promise<LessonPackage> {
  return api<LessonPackage>(`/api/lesson-packages/${id}`);
}

export async function createLessonPackage(data: {
  studentId: string;
  courseId: string;
  unitsTotal: number;
  autoRenew?: boolean;
  recoveryIncludedInPackage?: boolean;
  validFrom: string;
  validUntil?: string | null;
  invoiceId?: string | null;
}): Promise<LessonPackage> {
  return api<LessonPackage>("/api/lesson-packages", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function patchLessonPackage(id: string, data: {
  autoRenew?: boolean;
  status?: LessonPackageStatus;
  validUntil?: string | null;
}): Promise<LessonPackage> {
  return api<LessonPackage>(`/api/lesson-packages/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function runPackageRenewal(): Promise<{ renewed: number }> {
  return api<{ renewed: number }>("/api/lesson-packages/run-renewal", { method: "POST" });
}
