/**
 * HR-402 — Client-side API helpers for teacher stats.
 */
import { api } from "../api";

export type StatsPeriod = "7d" | "30d" | "90d" | "12m";

export interface TeacherStats {
  teacherId: string;
  teacherName: string;
  period: StatsPeriod;
  lessonsCompleted: number;
  hoursCompleted: number;
  studentAttendanceRate: number;
  revenueCents: number;
  topCourses: { courseName: string; lessonCount: number }[];
}

export function getTeacherStats(
  teacherId: string,
  period: StatsPeriod = "30d"
): Promise<TeacherStats> {
  return api<TeacherStats>(`/hr/teacher-stats/${teacherId}?period=${period}`);
}
