import { api } from "../api";

export interface SavedViewFilters {
  source?: string;
  assignedTo?: string;
  searchQuery?: string;
  filterNoTask?: boolean;
  filterOverdue?: boolean;
}

export interface SavedView {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  filters: SavedViewFilters;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listSavedViews(): Promise<{ views: SavedView[] }> {
  return api<{ views: SavedView[] }>("/api/saved-views");
}

export async function createSavedView(payload: {
  name: string;
  filters: SavedViewFilters;
  isPublic?: boolean;
}): Promise<{ view: SavedView }> {
  return api<{ view: SavedView }>("/api/saved-views", {
    method: "POST",
    body: JSON.stringify({ ...payload, isPublic: payload.isPublic ?? false }),
  });
}

export async function deleteSavedView(id: string): Promise<void> {
  await api<{ ok: boolean }>(`/api/saved-views/${id}`, { method: "DELETE" });
}
