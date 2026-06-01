/**
 * GAP-012 — Client-side API helpers for /api/progress
 */
import { api } from "../api";

export interface ProgressSkill {
  id: string;
  tenantId: string;
  courseId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProgressHistory {
  score: number;
  evaluatedAt: string;
  comment: string | null;
}

export interface SkillWithProgress {
  skillId: string;
  skillName: string;
  skillDescription: string | null;
  courseId: string;
  sortOrder: number;
  latestScore: number;
  latestAt: string;
  trend: "up" | "down" | "same" | "new";
  history: ProgressHistory[];
}

export interface StudentProgress {
  studentId: string;
  publicToken: string;
  skills: SkillWithProgress[];
}

export interface PublicProgress {
  studentId: string;
  skills: SkillWithProgress[];
  generatedAt: string;
}

export interface CreateSkillPayload {
  courseId: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
}

export interface CreateEntryPayload {
  studentId: string;
  skillId: string;
  lessonId?: string | null;
  score: number;
  comment?: string | null;
}

export async function listSkills(courseId?: string): Promise<ProgressSkill[]> {
  const qs = courseId ? `?courseId=${courseId}` : "";
  const res = await api<{ skills: ProgressSkill[] }>(`/api/progress/skills${qs}`);
  return res.skills;
}

export async function createSkill(payload: CreateSkillPayload): Promise<ProgressSkill> {
  return api<ProgressSkill>("/api/progress/skills", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteSkill(id: string): Promise<void> {
  await api(`/api/progress/skills/${id}`, { method: "DELETE" });
}

export async function getStudentProgress(studentId: string): Promise<StudentProgress> {
  return api<StudentProgress>(`/api/progress/students/${studentId}`);
}

export async function createEntry(payload: CreateEntryPayload): Promise<void> {
  await api("/api/progress/entries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPublicProgress(token: string): Promise<PublicProgress> {
  return api<PublicProgress>(`/api/progress/public/${token}`);
}
