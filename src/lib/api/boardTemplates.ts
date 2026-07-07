/** TB-004: client API — șabloane de taskuri per tip de produs + generare. */
import { api } from "../api";
import type { BoardTask, TaskPriority } from "./boardTasks";

export type TemplateOffsetAnchor = "start" | "end";

export interface BoardTaskTemplate {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  productKind: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Doar în listă (GET /). */
  itemCount?: number;
}

export interface BoardTaskTemplateItem {
  id: string;
  tenantId: string;
  templateId: string;
  title: string;
  description: string | null;
  assigneeRole: string | null;
  defaultPriority: TaskPriority;
  offsetAnchor: TemplateOffsetAnchor;
  offsetDays: number;
  defaultListName: string | null;
  position: number;
}

export interface TemplateItemInput {
  title: string;
  description?: string | null;
  assigneeRole?: string | null;
  defaultPriority?: TaskPriority;
  offsetAnchor?: TemplateOffsetAnchor;
  offsetDays?: number;
  defaultListName?: string | null;
  position?: number;
}

export function listTemplates(): Promise<{ templates: BoardTaskTemplate[] }> {
  return api("/api/board/templates");
}

export function getTemplate(
  id: string
): Promise<{ template: BoardTaskTemplate; items: BoardTaskTemplateItem[] }> {
  return api(`/api/board/templates/${id}`);
}

export function createTemplate(input: {
  name: string;
  description?: string | null;
  productKind?: string | null;
  items?: TemplateItemInput[];
}): Promise<{ template: BoardTaskTemplate; items: BoardTaskTemplateItem[] }> {
  return api("/api/board/templates", { method: "POST", body: JSON.stringify(input) });
}

export function updateTemplate(
  id: string,
  patch: Partial<{ name: string; description: string | null; productKind: string | null }>
): Promise<BoardTaskTemplate> {
  return api(`/api/board/templates/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function archiveTemplate(id: string): Promise<{ ok: boolean }> {
  return api(`/api/board/templates/${id}`, { method: "DELETE" });
}

export function addTemplateItem(
  templateId: string,
  input: TemplateItemInput
): Promise<BoardTaskTemplateItem> {
  return api(`/api/board/templates/${templateId}/items`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchTemplateItem(
  templateId: string,
  itemId: string,
  patch: Partial<TemplateItemInput>
): Promise<BoardTaskTemplateItem> {
  return api(`/api/board/templates/${templateId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteTemplateItem(templateId: string, itemId: string): Promise<{ ok: boolean }> {
  return api(`/api/board/templates/${templateId}/items/${itemId}`, { method: "DELETE" });
}

export interface GenerateResult {
  createdCount: number;
  skippedCount: number;
  unscheduledCount: number;
  tasks: BoardTask[];
}

/** Generează taskurile șablonului pe un board (idempotent implicit — rândurile deja generate se sar). */
export function generateFromTemplate(
  templateId: string,
  boardId: string,
  opts: { skipExisting?: boolean } = {}
): Promise<GenerateResult> {
  const qs = opts.skipExisting === false ? "?skipExisting=false" : "";
  return api(`/api/board/templates/${templateId}/generate${qs}`, {
    method: "POST",
    body: JSON.stringify({ boardId }),
  });
}
