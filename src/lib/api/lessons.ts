import { api } from "../api";

export interface Lesson {
  id: string;
  courseId: string;
  teacherId: string;
  scheduledAt: string;
  durationMinutes: number;
  status: "scheduled" | "completed" | "cancelled" | "rescheduled";
  meetingUrl: string | null;
  notes: string | null;
  courseName: string;
  courseLevel: string | null;
  teacherName: string;
}

export interface Teacher {
  id: string;
  userId: string;
  hourlyRateCents: number;
  commissionPct: number;
  name: string;
  email: string;
}

export interface Course {
  id: string;
  name: string;
  description: string | null;
  level: string | null;
  defaultPriceCents: number;
  durationMinutes: number;
}

export function listLessons(from?: string, to?: string): Promise<{ items: Lesson[] }> {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const query = qs.toString();
  return api<{ items: Lesson[] }>(`/api/lessons${query ? `?${query}` : ""}`);
}

export function createLesson(input: {
  courseId: string;
  teacherId: string;
  scheduledAt: string;
  durationMinutes: number;
}): Promise<Lesson> {
  return api<Lesson>("/api/lessons", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cancelLesson(id: string): Promise<{ ok: true; id: string }> {
  return api<{ ok: true; id: string }>(`/api/lessons/${id}`, { method: "DELETE" });
}

export function listTeachers(): Promise<{ items: Teacher[] }> {
  return api<{ items: Teacher[] }>("/api/teachers");
}

export function listCourses(): Promise<{ items: Course[] }> {
  return api<{ items: Course[] }>("/api/courses");
}

// SCHED-503: Attendance

export type AttendanceStatus = "present" | "absent" | "late" | "excused" | "pending";

export interface LessonStudent {
  studentLessonId: string;
  studentId: string;
  attendanceStatus: AttendanceStatus;
  markedBy: string | null;
  markedAt: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
}

export function getLessonStudents(lessonId: string): Promise<{ items: LessonStudent[] }> {
  return api<{ items: LessonStudent[] }>(`/api/lessons/${lessonId}/students`);
}

export function markAttendance(
  lessonId: string,
  studentId: string,
  attendanceStatus: Exclude<AttendanceStatus, "pending">
): Promise<LessonStudent> {
  return api<LessonStudent>(`/api/lessons/${lessonId}/students/${studentId}/attendance`, {
    method: "PATCH",
    body: JSON.stringify({ attendanceStatus }),
  });
}

// SCHED-504: iCal calendar token

export interface CalendarTokenResult {
  token: string;
  url: string;
  expiresInDays: number;
}

export function generateCalendarToken(teacherId: string): Promise<CalendarTokenResult> {
  return api<CalendarTokenResult>(`/api/teachers/${teacherId}/calendar-token`, {
    method: "POST",
  });
}
