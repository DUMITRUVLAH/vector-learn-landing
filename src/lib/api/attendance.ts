/**
 * SCHOOL-003 — Client API pentru catalogul de prezență
 */
import { api } from "../api";

export interface AttendanceSession {
  id: string;
  tenantId: string;
  classId: string;
  teacherId: string | null;
  date: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  tenantId: string;
  sessionId: string;
  studentId: string;
  status: "present" | "absent" | "late" | "excused";
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnrolledStudent {
  studentId: string;
  studentName: string | null;
}

export interface AttendanceResponse {
  session: AttendanceSession;
  records: AttendanceRecord[];
  enrolled: EnrolledStudent[];
}

export interface RecordInput {
  studentId: string;
  status: "present" | "absent" | "late" | "excused";
  reason?: string | null;
}

export interface StudentHistoryItem {
  recordId: string;
  sessionId: string;
  status: "present" | "absent" | "late" | "excused";
  reason: string | null;
  date: string;
  classId: string;
  updatedAt: string;
}

export interface StudentAttendanceHistory {
  studentId: string;
  history: StudentHistoryItem[];
  absenceCount: number;
  attendanceRate: number | null;
}

export async function getAttendance(
  classId: string,
  date: string
): Promise<AttendanceResponse> {
  return api<AttendanceResponse>(
    `/api/school/attendance?classId=${encodeURIComponent(classId)}&date=${encodeURIComponent(date)}`
  );
}

export async function createSession(payload: {
  classId: string;
  date: string;
  teacherId?: string | null;
  notes?: string | null;
}): Promise<{ session: AttendanceSession }> {
  return api<{ session: AttendanceSession }>("/api/school/attendance", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function saveAttendanceRecords(
  sessionId: string,
  records: RecordInput[]
): Promise<{ records: AttendanceRecord[] }> {
  return api<{ records: AttendanceRecord[] }>(
    `/api/school/attendance/${sessionId}/records`,
    {
      method: "PUT",
      body: JSON.stringify({ records }),
    }
  );
}

export async function getStudentAttendance(
  studentId: string,
  from?: string,
  to?: string
): Promise<StudentAttendanceHistory> {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const query = qs.toString();
  return api<StudentAttendanceHistory>(
    `/api/school/attendance/student/${studentId}${query ? `?${query}` : ""}`
  );
}
