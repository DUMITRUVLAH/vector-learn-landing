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
  /** SCHED-501: Optional room assignment */
  roomId?: string | null;
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
  roomId?: string | null;
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
