/**
 * GAP-005: Course waitlist API client
 */
import { api } from "../api";

export interface WaitlistEntry {
  id: string;
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  position: number;
  notifiedAt: string | null;
  confirmedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface WaitlistResponse {
  items: WaitlistEntry[];
  enrolled: number;
  maxStudents: number | null;
  isFull: boolean;
}

export async function getCourseWaitlist(courseId: string): Promise<WaitlistResponse> {
  return api<WaitlistResponse>(`/api/courses/${courseId}/waitlist`);
}

export async function joinWaitlist(courseId: string, studentId: string): Promise<{ entry: WaitlistEntry; position: number }> {
  return api<{ entry: WaitlistEntry; position: number }>(`/api/courses/${courseId}/waitlist`, {
    method: "POST",
    body: JSON.stringify({ studentId }),
  });
}

export async function confirmWaitlistEntry(entryId: string, courseId: string): Promise<{ confirmed: WaitlistEntry; enrolledLessons: number }> {
  return api<{ confirmed: WaitlistEntry; enrolledLessons: number }>(`/api/waitlist/${entryId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ courseId }),
  });
}

export async function notifyFirstOnWaitlist(courseId: string): Promise<{ ok: boolean; notified: boolean; studentId?: string }> {
  return api<{ ok: boolean; notified: boolean; studentId?: string }>(`/api/courses/${courseId}/waitlist/notify-first`, {
    method: "POST",
  });
}
