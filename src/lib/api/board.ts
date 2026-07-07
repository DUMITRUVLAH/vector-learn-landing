/** TB-001: client API — boards + liste (coloane Kanban) + etichete. */
import { api } from "../api";

export interface Board {
  id: string;
  tenantId: string;
  productId: string | null;
  name: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardList {
  id: string;
  tenantId: string;
  boardId: string;
  name: string;
  position: number;
  wipLimit: number | null;
  isDoneList: boolean;
  colorToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardLabel {
  id: string;
  tenantId: string;
  boardId: string;
  name: string;
  colorToken: string;
}

export function listBoards(productId?: string): Promise<{ boards: Board[] }> {
  const qs = productId ? `?productId=${encodeURIComponent(productId)}` : "";
  return api(`/api/board/boards${qs}`);
}

export function getBoard(
  id: string
): Promise<{ board: Board; lists: BoardList[]; labels: BoardLabel[] }> {
  return api(`/api/board/boards/${id}`);
}

export function createBoard(input: {
  name: string;
  description?: string | null;
  productId?: string | null;
  skipDefaultLists?: boolean;
}): Promise<{ board: Board; lists: BoardList[] }> {
  return api("/api/board/boards", { method: "POST", body: JSON.stringify(input) });
}

export function updateBoard(
  id: string,
  patch: Partial<{ name: string; description: string | null; productId: string | null }>
): Promise<Board> {
  return api(`/api/board/boards/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function archiveBoard(id: string): Promise<{ ok: boolean }> {
  return api(`/api/board/boards/${id}`, { method: "DELETE" });
}

export function createBoardList(input: {
  boardId: string;
  name: string;
  position?: number;
  wipLimit?: number | null;
  isDoneList?: boolean;
}): Promise<BoardList> {
  return api("/api/board/lists", { method: "POST", body: JSON.stringify(input) });
}

export function updateBoardList(
  id: string,
  patch: Partial<{ name: string; position: number; wipLimit: number | null; isDoneList: boolean }>
): Promise<BoardList> {
  return api(`/api/board/lists/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function deleteBoardList(id: string): Promise<{ ok: boolean }> {
  return api(`/api/board/lists/${id}`, { method: "DELETE" });
}

export function reorderBoardLists(order: string[]): Promise<{ lists: BoardList[] }> {
  return api("/api/board/lists/reorder", { method: "POST", body: JSON.stringify({ order }) });
}
