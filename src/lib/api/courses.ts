/**
 * COURSE-101: Courses API client
 */

const BASE = "/api/courses";

export interface Course {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  level?: string | null;
  cefrLevel?: string | null;
  defaultPriceCents: number;
  durationMinutes: number;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface ListCoursesParams {
  includeArchived?: boolean;
}

export interface CreateCourseBody {
  name: string;
  description?: string | null;
  level?: string | null;
  cefrLevel?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
  defaultPriceCents?: number;
  durationMinutes?: number;
}

export interface PatchCourseBody {
  name?: string;
  description?: string | null;
  level?: string | null;
  cefrLevel?: "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | null;
  defaultPriceCents?: number;
  durationMinutes?: number;
  status?: "active" | "archived";
}

export async function listCourses(params?: ListCoursesParams): Promise<{ items: Course[] }> {
  const qs = params?.includeArchived ? "?includeArchived=true" : "";
  const res = await fetch(`${BASE}${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error(`listCourses: ${res.status}`);
  return res.json() as Promise<{ items: Course[] }>;
}

export async function getCourse(id: string): Promise<Course> {
  const res = await fetch(`${BASE}/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`getCourse: ${res.status}`);
  return res.json() as Promise<Course>;
}

export async function createCourse(body: CreateCourseBody): Promise<Course> {
  const res = await fetch(BASE, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createCourse: ${res.status}`);
  return res.json() as Promise<Course>;
}

export async function patchCourse(id: string, body: PatchCourseBody): Promise<Course> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`patchCourse: ${res.status}`);
  return res.json() as Promise<Course>;
}

export async function archiveCourse(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`archiveCourse: ${res.status}`);
  return res.json() as Promise<{ ok: boolean }>;
}
