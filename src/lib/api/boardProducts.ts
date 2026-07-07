/** TB-001: client API — produse/cursuri (dimensiunea de planificare TaskBoard). */
import { api } from "../api";

export interface BoardProduct {
  id: string;
  tenantId: string;
  name: string;
  kind: string;
  courseId: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  colorToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardProductInput {
  name: string;
  kind?: string;
  courseId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  colorToken?: string | null;
}

export function listBoardProducts(includeArchived = false): Promise<{ products: BoardProduct[] }> {
  return api(`/api/board/products${includeArchived ? "?status=all" : ""}`);
}

export function createBoardProduct(input: BoardProductInput): Promise<BoardProduct> {
  return api("/api/board/products", { method: "POST", body: JSON.stringify(input) });
}

export function updateBoardProduct(
  id: string,
  patch: Partial<BoardProductInput & { status: string }>
): Promise<BoardProduct> {
  return api(`/api/board/products/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export function archiveBoardProduct(id: string): Promise<{ ok: boolean }> {
  return api(`/api/board/products/${id}`, { method: "DELETE" });
}
