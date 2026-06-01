/**
 * GAP-011 — Client-side API helpers for public enrollment
 */
import { api } from "../api";

export interface EnrollCohort {
  id: string;
  label: string;
  startDate: string;
  totalHours: number;
  isOnline: boolean;
  courseName: string | null;
  courseDescription: string | null;
  seatsRemaining: number | null;
  maxParticipants: number;
}

export interface EnrollResult {
  enrollmentId: string;
  status: "pending" | "waitlisted";
  checkoutUrl: string | null;
  waitlisted: boolean;
}

/** GET /api/enroll/:slug — cohort details (public) */
export async function getCohortBySlug(slug: string): Promise<{ cohort: EnrollCohort }> {
  return api<{ cohort: EnrollCohort }>(`/api/enroll/${slug}`);
}

/** POST /api/enroll/:slug — submit enrollment (public) */
export async function submitEnrollment(
  slug: string,
  payload: { name: string; email: string; phone?: string }
): Promise<EnrollResult> {
  return api<EnrollResult>(`/api/enroll/${slug}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
