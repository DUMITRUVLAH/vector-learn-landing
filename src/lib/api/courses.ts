/**
 * INTEG-202 — Client-side API helpers for /api/courses
 *
 * Used by ContractsPage to populate the course picker dropdown.
 */
import { api } from "../api";

export interface CourseItem {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  level: string | null;
  defaultPriceCents: number;
  durationMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export async function listCourses(): Promise<{ items: CourseItem[] }> {
  return api<{ items: CourseItem[] }>("/api/courses");
}
