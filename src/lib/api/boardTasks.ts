/** TB-001: client API — taskuri (sursa unică pentru Tabel/Kanban/Calendar). */
import { api } from "../api";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface BoardTask {
  id: string;
  tenantId: string;
  boardId: string;
  listId: string | null;
  productId: string | null;
  title: string;
  description: string | null;
  position: number;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeUserId: string | null;
  assigneeRole: string | null;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  templateItemId: string | null;
  sourceTemplateId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** TB-005: id-urile etichetelor atașate (populat de GET /api/board/tasks). */
  labelIds?: string[];
}

export interface TaskFilters {
  boardId?: string;
  productId?: string;
  status?: TaskStatus;
  assignee?: string;
  hasDueDate?: boolean;
}

export interface TaskPatch {
  listId?: string | null;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeUserId?: string | null;
  assigneeRole?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  position?: number;
}

export function listTasks(filters: TaskFilters = {}): Promise<{ tasks: BoardTask[] }> {
  const params = new URLSearchParams();
  if (filters.boardId) params.set("boardId", filters.boardId);
  if (filters.productId) params.set("productId", filters.productId);
  if (filters.status) params.set("status", filters.status);
  if (filters.assignee) params.set("assignee", filters.assignee);
  if (filters.hasDueDate !== undefined) params.set("hasDueDate", String(filters.hasDueDate));
  const qs = params.toString();
  return api(`/api/board/tasks${qs ? `?${qs}` : ""}`);
}

export function createTask(
  input: { boardId: string; title: string } & TaskPatch
): Promise<BoardTask> {
  return api("/api/board/tasks", { method: "POST", body: JSON.stringify(input) });
}

/** Plan-first: creează N taskuri doar cu titlu (restul null — se programează ulterior). */
export function createTasksBulk(input: {
  boardId: string;
  titles: string[];
  listId?: string | null;
}): Promise<{ created: number; tasks: BoardTask[] }> {
  return api("/api/board/tasks/bulk", { method: "POST", body: JSON.stringify(input) });
}

export function patchTask(id: string, patch: TaskPatch): Promise<BoardTask> {
  return api(`/api/board/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

/** Mutare Kanban — serverul deține sync-ul listă↔status și rebalansarea pozițiilor. */
export function moveTask(
  id: string,
  input: { listId: string | null; position: number }
): Promise<{ task: BoardTask; rebalanced: boolean }> {
  return api(`/api/board/tasks/${id}/move`, { method: "POST", body: JSON.stringify(input) });
}

export function archiveTask(id: string): Promise<{ ok: boolean }> {
  return api(`/api/board/tasks/${id}`, { method: "DELETE" });
}
