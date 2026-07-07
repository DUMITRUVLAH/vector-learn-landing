/** TB-005: client API — detaliile cardului: etichete, checklist, comentarii, atașamente. */
import { api } from "../api";
import type { BoardTask } from "./boardTasks";
import type { BoardLabel } from "./board";

export interface TaskChecklistItem {
  id: string;
  taskId: string;
  text: string;
  done: boolean;
  position: number;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorName: string | null;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  filename: string;
  url: string;
  sizeBytes: number | null;
  uploadedByUserId: string | null;
  createdAt: string;
}

export interface TaskDetail {
  task: BoardTask;
  labels: Pick<BoardLabel, "id" | "name" | "colorToken">[];
  checklist: TaskChecklistItem[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
}

export function getTaskDetail(taskId: string): Promise<TaskDetail> {
  return api(`/api/board/tasks/${taskId}`);
}

// ── Etichete ─────────────────────────────────────────────────────────────────

export function createLabel(input: {
  boardId: string;
  name: string;
  colorToken?: string;
}): Promise<BoardLabel> {
  return api("/api/board/labels", { method: "POST", body: JSON.stringify(input) });
}

export function deleteLabel(id: string): Promise<{ ok: boolean }> {
  return api(`/api/board/labels/${id}`, { method: "DELETE" });
}

/** Atașează/detașează eticheta pe task (toggle idempotent per stare). */
export function toggleTaskLabel(taskId: string, labelId: string): Promise<{ attached: boolean }> {
  return api("/api/board/labels/toggle", {
    method: "POST",
    body: JSON.stringify({ taskId, labelId }),
  });
}

// ── Checklist ────────────────────────────────────────────────────────────────

export function addChecklistItem(taskId: string, text: string): Promise<TaskChecklistItem> {
  return api("/api/board/checklists", { method: "POST", body: JSON.stringify({ taskId, text }) });
}

export function patchChecklistItem(
  id: string,
  patch: Partial<{ text: string; done: boolean; position: number }>
): Promise<TaskChecklistItem> {
  return api(`/api/board/checklists/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteChecklistItem(id: string): Promise<{ ok: boolean }> {
  return api(`/api/board/checklists/${id}`, { method: "DELETE" });
}

// ── Comentarii ───────────────────────────────────────────────────────────────

export function addComment(taskId: string, body: string): Promise<TaskComment> {
  return api("/api/board/comments", { method: "POST", body: JSON.stringify({ taskId, body }) });
}

export function deleteComment(id: string): Promise<{ ok: boolean }> {
  return api(`/api/board/comments/${id}`, { method: "DELETE" });
}

// ── Atașamente (metadata) ────────────────────────────────────────────────────

export function addAttachment(input: {
  taskId: string;
  filename: string;
  url: string;
  sizeBytes?: number;
}): Promise<TaskAttachment> {
  return api("/api/board/attachments", { method: "POST", body: JSON.stringify(input) });
}

export function deleteAttachment(id: string): Promise<{ ok: boolean }> {
  return api(`/api/board/attachments/${id}`, { method: "DELETE" });
}
