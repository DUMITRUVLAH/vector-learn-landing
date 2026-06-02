import { api } from "../api";

export interface Student {
  id: string;
  tenantId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  parentPhone: string | null;
  parentEmail: string | null;
  birthDate: string | null;
  status: "active" | "trial" | "paused" | "archived";
  notes: string | null;
  /** FIN-602: Outstanding debt in cents */
  debtCents?: number;
  /** GAP-001: Preferred schedule */
  preferredDays?: number[] | null;
  preferredTimeStart?: string | null;
  preferredTimeEnd?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListStudentsResponse {
  items: Student[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListStudentsParams {
  search?: string;
  status?: "active" | "trial" | "paused" | "archived" | "all";
  limit?: number;
  offset?: number;
  /** BRANCH-702: filter by branch UUID, omit for all branches */
  branch_id?: string;
}

export interface StudentInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  parentPhone?: string | null;
  parentEmail?: string | null;
  birthDate?: string | null;
  status?: "active" | "trial" | "paused" | "archived";
  notes?: string | null;
  /** GAP-001: Preferred schedule */
  preferredDays?: number[] | null;
  preferredTimeStart?: string | null;
  preferredTimeEnd?: string | null;
}

export function listStudents(params: ListStudentsParams = {}): Promise<ListStudentsResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.status) qs.set("status", params.status);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.offset !== undefined) qs.set("offset", String(params.offset));
  // BRANCH-702: optional branch filter
  if (params.branch_id) qs.set("branch_id", params.branch_id);
  const query = qs.toString();
  return api<ListStudentsResponse>(`/api/students${query ? `?${query}` : ""}`);
}

export function createStudent(input: StudentInput): Promise<Student> {
  return api<Student>("/api/students", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateStudent(id: string, input: Partial<StudentInput>): Promise<Student> {
  return api<Student>(`/api/students/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getStudent(id: string): Promise<Student> {
  return api<Student>(`/api/students/${id}`);
}

export function archiveStudent(id: string): Promise<{ ok: true; id: string }> {
  return api<{ ok: true; id: string }>(`/api/students/${id}`, {
    method: "DELETE",
  });
}

export function getStudent(id: string): Promise<Student> {
  return api<Student>(`/api/students/${id}`);
}

// STU-201: Student payment history
export interface StudentPayment {
  id: string;
  amountCents: number;
  currency: string;
  status: "pending" | "paid" | "overdue" | "refunded" | "cancelled";
  dueDate: string | null;
  paidAt: string | null;
  description: string | null;
  createdAt: string;
}

export interface StudentPaymentsResponse {
  items: StudentPayment[];
  totalPaidCents: number;
}

export function getStudentPayments(id: string): Promise<StudentPaymentsResponse> {
  return api<StudentPaymentsResponse>(`/api/students/${id}/payments`);
}

// STU-201: Student lesson attendance history
export interface StudentLesson {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  lessonStatus: string;
  attendanceStatus: "present" | "absent" | "late" | "excused" | "pending";
  courseName: string;
  teacherName: string;
}

export interface StudentLessonsResponse {
  items: StudentLesson[];
}

export function getStudentLessons(id: string): Promise<StudentLessonsResponse> {
  return api<StudentLessonsResponse>(`/api/students/${id}/lessons`);
}

// STU-201: Origin lead lookup
export interface OriginLead {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
}

export interface OriginLeadResponse {
  lead: OriginLead | null;
}

export function getStudentOriginLead(id: string): Promise<OriginLeadResponse> {
  return api<OriginLeadResponse>(`/api/students/${id}/origin-lead`);
}

// STU-202: Student notes timeline
export type NoteType = "general" | "pedagogical" | "parent_comm";

export interface StudentNote {
  id: string;
  tenantId: string;
  studentId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  noteType: NoteType;
  createdAt: string;
  updatedAt: string;
}

export interface StudentNotesResponse {
  items: StudentNote[];
}

export function getStudentNotes(studentId: string): Promise<StudentNotesResponse> {
  return api<StudentNotesResponse>(`/api/students/${studentId}/notes`);
}

export function createStudentNote(
  studentId: string,
  body: string,
  noteType: NoteType = "general"
): Promise<StudentNote> {
  return api<StudentNote>(`/api/students/${studentId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body, noteType }),
  });
}

export function deleteStudentNote(studentId: string, noteId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/students/${studentId}/notes/${noteId}`, {
    method: "DELETE",
  });
}

// STU-205: Duplicate detection at student creation
export interface DuplicateMatch {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  status: string;
}

export interface CheckDuplicateResponse {
  matches: DuplicateMatch[];
}

export function checkStudentDuplicate(params: {
  phone?: string;
  fullName?: string;
}): Promise<CheckDuplicateResponse> {
  const qs = new URLSearchParams();
  if (params.phone) qs.set("phone", params.phone);
  if (params.fullName) qs.set("fullName", params.fullName);
  return api<CheckDuplicateResponse>(`/api/students/check-duplicate?${qs.toString()}`);
}
