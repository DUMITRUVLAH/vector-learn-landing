/** TB-001: client API — prezentare manager (progres per produs). */
import { api } from "../api";

export interface ProductOverview {
  productId: string | null;
  productName: string;
  todo: number;
  inProgress: number;
  blocked: number;
  done: number;
  total: number;
  overdue: number;
  unassigned: number;
}

export function getBoardOverview(productId?: string): Promise<{ overview: ProductOverview[] }> {
  const qs = productId ? `?productId=${encodeURIComponent(productId)}` : "";
  return api(`/api/board/overview${qs}`);
}
