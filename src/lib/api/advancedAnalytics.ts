/**
 * GAP-016: Advanced analytics API client
 */
import { api } from "../api";

export interface RetentionByCourse {
  courseId: string;
  courseName: string;
  activeNow: number;
  activePrev: number;
  retentionPct: number | null;
  trend: "up" | "stable" | "down";
}

export interface RevenueByTeacher {
  teacherId: string;
  teacherName: string;
  revenueRon: number;
  lessonCount: number;
}

export interface ChurnRiskStudent {
  studentId: string;
  name: string;
  riskScore: number;
  reasons: string[];
}

export async function getRetentionByCourse(): Promise<RetentionByCourse[]> {
  return api("/api/analytics/retention-by-course");
}

export async function getRevenueByTeacher(): Promise<RevenueByTeacher[]> {
  return api("/api/analytics/revenue-by-teacher");
}

export async function getChurnRisk(): Promise<ChurnRiskStudent[]> {
  return api("/api/analytics/churn-risk");
}
