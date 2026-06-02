/**
 * BRANCH-701 — Client-side API helpers for /api/branches
 */
import { api } from "../api";

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  managerUserId: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBranchPayload {
  name: string;
  address?: string;
  managerUserId?: string;
  isDefault?: boolean;
}

/** GET /api/branches */
export function getBranches(): Promise<{ branches: Branch[] }> {
  return api<{ branches: Branch[] }>("/api/branches");
}

/** GET /api/branches/current */
export function getCurrentBranch(): Promise<{ branch: Branch | null }> {
  return api<{ branch: Branch | null }>("/api/branches/current");
}

/** POST /api/branches */
export function createBranch(payload: CreateBranchPayload): Promise<{ branch: Branch }> {
  return api<{ branch: Branch }>("/api/branches", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /api/branches/:id */
export function getBranch(id: string): Promise<{ branch: Branch }> {
  return api<{ branch: Branch }>(`/api/branches/${id}`);
}

/** PUT /api/branches/:id */
export function updateBranch(
  id: string,
  payload: Partial<CreateBranchPayload>
): Promise<{ branch: Branch }> {
  return api<{ branch: Branch }>(`/api/branches/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/branches/:id */
export function deleteBranch(id: string): Promise<{ deleted: boolean }> {
  return api<{ deleted: boolean }>(`/api/branches/${id}`, {
    method: "DELETE",
  });
}

// ─── BRANCH-704: KPI Reports ──────────────────────────────────────────────────

export interface BranchKPI {
  branchId: string;
  branchName: string;
  activeStudents: number;
  monthlyRevenue: number;
  retentionRate: number;
}

export interface NetworkKPI {
  activeStudents: number;
  monthlyRevenue: number;
  retentionRate: number;
}

export interface BranchKPIResponse {
  consolidated: NetworkKPI;
  byBranch: BranchKPI[];
}

/**
 * GET /api/branches/reports/kpi?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns consolidated + per-branch KPIs for the authenticated tenant.
 */
export function getBranchKPI(params?: {
  from?: string;
  to?: string;
}): Promise<BranchKPIResponse> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return api<BranchKPIResponse>(`/api/branches/reports/kpi${query}`);
}

/**
 * BRANCH-703: PUT /api/branches/:branchId/users/:userId/scope
 * Set or clear branch_scope for a user.
 * scope = UUID → restrict user to that branch. scope = null → global access.
 */
export function setUserBranchScope(
  branchId: string,
  userId: string,
  scope: string | null
): Promise<{ user: { id: string; branchScope: string | null } }> {
  return api<{ user: { id: string; branchScope: string | null } }>(
    `/api/branches/${branchId}/users/${userId}/scope`,
    {
      method: "PUT",
      body: JSON.stringify({ scope }),
    }
  );
}
