/**
 * GAP-015: Homework API client
 */
import { api } from "../api";

export interface Homework {
  id: string;
  lessonId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  createdAt: string;
  submissionCount?: number;
}

export interface StudentHomework extends Homework {
  status: "pending" | "submitted";
  submittedAt: string | null;
  submissionNotes: string | null;
}

export interface HomeworkSubmission {
  id: string;
  homeworkId: string;
  studentId: string;
  submittedAt: string;
  notes: string | null;
}

export async function listLessonHomework(lessonId: string): Promise<Homework[]> {
  return api(`/api/lessons/${lessonId}/homework`);
}

export async function createHomework(
  lessonId: string,
  data: { title: string; description?: string | null; dueDate?: string | null }
): Promise<Homework> {
  return api(`/api/lessons/${lessonId}/homework`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteHomework(lessonId: string, homeworkId: string): Promise<void> {
  await api(`/api/lessons/${lessonId}/homework/${homeworkId}`, { method: "DELETE" });
}

export async function submitHomework(
  homeworkId: string,
  studentId: string,
  notes?: string | null
): Promise<HomeworkSubmission> {
  return api(`/api/homework/${homeworkId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId, notes }),
  });
}

export async function listStudentHomework(studentId: string): Promise<StudentHomework[]> {
  return api(`/api/students/${studentId}/homework`);
}
