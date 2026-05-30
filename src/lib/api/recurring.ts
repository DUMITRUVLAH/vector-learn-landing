/**
 * SCHED-502 — Client-side API helpers for recurring lesson series.
 */
import { api } from "../api";
import type { Lesson } from "./lessons";

export interface LessonSeries {
  id: string;
  tenantId: string;
  label: string;
  recurrenceType: "weekly";
  dayOfWeek: number;
  occurrences: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRecurringInput {
  courseId: string;
  teacherId: string;
  firstScheduledAt: string;
  durationMinutes?: number;
  meetingUrl?: string | null;
  notes?: string | null;
  roomId?: string | null;
  recurrence: {
    type: "weekly";
    count: number;
  };
}

export interface RecurringConflict {
  occurrence: number;
  scheduledAt: string;
  conflictId: string;
  type: "teacher_double_booked" | "room_double_booked";
}

export function createRecurringLessons(input: CreateRecurringInput): Promise<{
  series: LessonSeries;
  lessons: Lesson[];
}> {
  return api("/lessons/recurring", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cancelSeriesFuture(
  seriesId: string,
  from: string
): Promise<{ cancelledCount: number; cancelledIds: string[] }> {
  return api(`/lessons/series/${seriesId}/future?from=${encodeURIComponent(from)}`, {
    method: "DELETE",
  });
}
