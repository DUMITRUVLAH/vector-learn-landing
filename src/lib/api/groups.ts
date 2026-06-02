/**
 * COURSE-202 — Client-side API helpers for /api/groups
 * Groups: capacity-capped class sections within a course.
 */
import { api } from "../api";

export interface Group {
  id: string;
  tenantId: string;
  courseId: string;
  name: string;
  teacherId: string | null;
  maxStudents: number;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
  /** Enriched: current enrollment count */
  enrolled: number;
  /** Enriched: current waitlist count */
  waitlisted: number;
  /** Enriched: spots remaining (maxStudents - enrolled) */
  spotsRemaining?: number;
  /** Optional: schedule template JSON */
  scheduleTemplate?: string | null;
}

export type CreateGroupBody = {
  courseId: string;
  name: string;
  teacherId?: string | null;
  maxStudents?: number;
  scheduleTemplate?: string | null;
};

export type PatchGroupBody = Partial<CreateGroupBody>;

export async function patchGroup(id: string, body: PatchGroupBody): Promise<Group> {
  const { api } = await import("../api");
  return api<Group>(`/api/groups/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export interface StudentInGroup {
  id: string;
  name: string;
  email: string;
  enrolledAt: string;
  status: "enrolled" | "waitlisted";
}

export async function listGroupEnrollments(groupId: string): Promise<StudentInGroup[]> {
  const { api } = await import("../api");
  return api<StudentInGroup[]>(`/api/groups/${groupId}/students`);
}

export interface StudentGroupEntry {
  groupId: string;
  groupName: string;
  courseId: string;
  courseName: string;
  status: "enrolled" | "waitlisted";
  enrolledAt: string;
}

export async function listStudentGroups(studentId: string): Promise<StudentGroupEntry[]> {
  const { api } = await import("../api");
  return api<StudentGroupEntry[]>(`/api/students/${studentId}/groups`);
}

export interface GroupCapacity {
  enrolled: number;
  max: number;
  waitlisted: number;
}

export interface CreateGroupPayload {
  courseId: string;
  name: string;
  teacherId?: string | null;
  maxStudents?: number;
}

export interface EnrollResult {
  status: "enrolled" | "waitlisted";
}

export interface UnenrollResult {
  ok: boolean;
  promoted: string | null;
}

/** Get a single group by ID. */
export async function getGroup(id: string): Promise<Group> {
  return api<Group>(`/api/groups/${id}`);
}

/** List all active groups for this tenant; optionally filter by courseId. */
export async function listGroups(courseId?: string): Promise<Group[]> {
  const params = courseId ? `?courseId=${encodeURIComponent(courseId)}` : "";
  const data = await api<{ items: Group[] }>(`/api/groups${params}`);
  return data.items;
}

/** Create a new group. */
export async function createGroup(payload: CreateGroupPayload): Promise<Group> {
  return api<Group>("/api/groups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** Get capacity info for a group. */
export async function getGroupCapacity(groupId: string): Promise<GroupCapacity> {
  return api<GroupCapacity>(`/api/groups/${groupId}/capacity`);
}

/** Enroll or waitlist a student in a group. */
export async function enrollStudent(
  groupId: string,
  studentId: string
): Promise<EnrollResult> {
  return api<EnrollResult>(`/api/groups/${groupId}/enroll`, {
    method: "POST",
    body: JSON.stringify({ studentId }),
  });
}

/** Unenroll a student from a group. First on waitlist is auto-promoted. */
export async function unenrollStudent(
  groupId: string,
  studentId: string
): Promise<UnenrollResult> {
  return api<UnenrollResult>(`/api/groups/${groupId}/enroll/${studentId}`, {
    method: "DELETE",
  });
}
