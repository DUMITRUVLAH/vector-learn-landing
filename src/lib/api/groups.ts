/**
 * COURSE-102/103: Groups API client — groups CRUD + enrollment
 */

const BASE = "/api/groups";

export interface ScheduleTemplate {
  days: string[];
  startTime: string;
  endTime: string;
}

export interface Group {
  id: string;
  tenantId: string;
  courseId: string;
  teacherId?: string | null;
  roomId?: string | null;
  name: string;
  scheduleTemplate?: ScheduleTemplate | null;
  maxStudents: number;
  status: "active" | "archived";
  enrolledCount: number;
  spotsRemaining: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGroupBody {
  courseId: string;
  teacherId?: string | null;
  roomId?: string | null;
  name: string;
  scheduleTemplate?: ScheduleTemplate | null;
  maxStudents?: number;
}

export interface PatchGroupBody {
  teacherId?: string | null;
  roomId?: string | null;
  name?: string;
  scheduleTemplate?: ScheduleTemplate | null;
  maxStudents?: number;
  status?: "active" | "archived";
}

export interface ListGroupsParams {
  courseId?: string;
  includeArchived?: boolean;
}

export async function listGroups(params?: ListGroupsParams): Promise<{ items: Group[] }> {
  const qp = new URLSearchParams();
  if (params?.courseId) qp.set("courseId", params.courseId);
  if (params?.includeArchived) qp.set("includeArchived", "true");
  const qs = qp.toString() ? `?${qp.toString()}` : "";
  const res = await fetch(`${BASE}${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error(`listGroups: ${res.status}`);
  return res.json() as Promise<{ items: Group[] }>;
}

export async function getGroup(id: string): Promise<Group> {
  const res = await fetch(`${BASE}/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(`getGroup: ${res.status}`);
  return res.json() as Promise<Group>;
}

export async function createGroup(body: CreateGroupBody): Promise<Group> {
  const res = await fetch(BASE, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createGroup: ${res.status}`);
  return res.json() as Promise<Group>;
}

export async function patchGroup(id: string, body: PatchGroupBody): Promise<Group> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`patchGroup: ${res.status}`);
  return res.json() as Promise<Group>;
}

export async function archiveGroup(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`archiveGroup: ${res.status}`);
  return res.json() as Promise<{ ok: boolean }>;
}

// ─── COURSE-103: Enrollment ────────────────────────────────────────────────

export interface GroupEnrollment {
  id: string;
  tenantId: string;
  groupId: string;
  studentId: string;
  enrolledAt: string;
  status: "active" | "removed";
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StudentInGroup {
  enrollment: GroupEnrollment;
  student: {
    id: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    parentEmail?: string | null;
    status: string;
  };
}

export interface StudentGroupEntry {
  enrollment: GroupEnrollment;
  group: Group;
  courseName: string;
  courseCefr?: string | null;
}

export async function listGroupEnrollments(groupId: string): Promise<{ items: StudentInGroup[] }> {
  const res = await fetch(`${BASE}/${groupId}/enrollments`, { credentials: "include" });
  if (!res.ok) throw new Error(`listGroupEnrollments: ${res.status}`);
  return res.json() as Promise<{ items: StudentInGroup[] }>;
}

export async function enrollStudent(
  groupId: string,
  body: { studentId: string; createPayment?: boolean }
): Promise<{ enrollment: GroupEnrollment; payment?: unknown }> {
  const res = await fetch(`${BASE}/${groupId}/enroll`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw Object.assign(new Error(`enrollStudent: ${res.status}`), {
      status: res.status,
      code: data.error ?? "unknown",
    });
  }
  return res.json() as Promise<{ enrollment: GroupEnrollment; payment?: unknown }>;
}

export async function unenrollStudent(
  groupId: string,
  studentId: string
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/${groupId}/enroll/${studentId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(`unenrollStudent: ${res.status}`);
  return res.json() as Promise<{ ok: boolean }>;
}

export async function listStudentGroups(studentId: string): Promise<{ items: StudentGroupEntry[] }> {
  const res = await fetch(`/api/students/${studentId}/groups`, { credentials: "include" });
  if (!res.ok) throw new Error(`listStudentGroups: ${res.status}`);
  return res.json() as Promise<{ items: StudentGroupEntry[] }>;
}
