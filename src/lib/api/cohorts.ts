/**
 * CX-701/702 — Client-side API helpers for /api/cohorts
 */
import { api } from "../api";
import type { CohortProgress } from "../cohortDates";

export interface Cohort {
  id: string;
  tenantId: string;
  courseId: string;
  /** INTEG-203: denormalized course name from LEFT JOIN (list endpoint) */
  courseName?: string | null;
  label: string;
  startDate: string;
  totalHours: number;
  hoursPerSession: number;
  scheduleDays: string[] | null;
  isOnline: boolean;
  manualEndDate: string | null;
  mentorCostCents: number;
  roomCostCents: number;
  driveFolderUrl: string | null;
  createdAt: string;
  updatedAt: string;
  // Enriched by server
  endDate: string;
  progress: CohortProgress;
  category: "active" | "upcoming" | "past";
}

export interface CreateCohortPayload {
  courseId: string;
  label: string;
  startDate: string;
  totalHours?: number;
  hoursPerSession?: number;
  scheduleDays?: string[] | null;
  isOnline?: boolean;
  manualEndDate?: string | null;
  mentorCostCents?: number;
  roomCostCents?: number;
  driveFolderUrl?: string | null;
}

export interface PatchCohortPayload extends Partial<CreateCohortPayload> {}

export async function listCohorts(): Promise<{ cohorts: Cohort[] }> {
  return api<{ cohorts: Cohort[] }>("/api/cohorts");
}

export async function createCohort(
  payload: CreateCohortPayload
): Promise<{ cohort: Cohort }> {
  return api<{ cohort: Cohort }>("/api/cohorts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function patchCohort(
  id: string,
  payload: PatchCohortPayload
): Promise<{ cohort: Cohort }> {
  return api<{ cohort: Cohort }>(`/api/cohorts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteCohort(id: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/cohorts/${id}`, { method: "DELETE" });
}
