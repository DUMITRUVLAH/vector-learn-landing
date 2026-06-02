import { api } from "../api";

export type BranchStatus = "active" | "archived";

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  managerUserId: string | null;
  status: BranchStatus;
  createdAt: string;
  updatedAt: string;
}

export function listBranches(): Promise<{ items: Branch[] }> {
  return api<{ items: Branch[] }>("/api/branches");
}

export function createBranch(input: {
  name: string;
  address?: string | null;
  managerUserId?: string | null;
}): Promise<Branch> {
  return api<Branch>("/api/branches", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateBranch(
  id: string,
  patch: { name?: string; address?: string | null; managerUserId?: string | null }
): Promise<Branch> {
  return api<Branch>(`/api/branches/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function archiveBranch(id: string): Promise<{ ok: true; id: string; status: "archived" }> {
  return api<{ ok: true; id: string; status: "archived" }>(`/api/branches/${id}`, {
    method: "DELETE",
  });
}

/** Alias for archiveBranch (used by BranchesPage) */
export const deleteBranch = archiveBranch;

export interface BranchStats {
  branchId: string;
  name: string;
  studentCount: number;
  teacherCount: number;
  lessonCountThisMonth: number;
  revenueThisMonthCents: number;
}

export interface BranchRollup {
  totalStudents: number;
  totalTeachers: number;
  totalRevenueCents: number;
  branches: BranchStats[];
}

export interface BranchKPIResponse extends BranchStats {}

export function getBranchStats(): Promise<{ items: BranchStats[] }> {
  return api<{ items: BranchStats[] }>("/api/branches/stats");
}

export function getBranchRollup(): Promise<BranchRollup> {
  return api<BranchRollup>("/api/branches/rollup");
}

export function setUserBranchScope(userId: string, branchId: string | null): Promise<{ ok: true }> {
  return api<{ ok: true }>(`/api/settings/team/${userId}/branch-scope`, {
    method: "PATCH",
    body: JSON.stringify({ branchId }),
  });
}

/** Assigns (or removes) a manager user to a branch. */
export function assignManager(branchId: string, userId: string | null): Promise<Branch> {
  return api<Branch>(`/api/branches/${branchId}`, {
    method: "PATCH",
    body: JSON.stringify({ managerUserId: userId }),
  });
}

// ─── BRANCH-704: Per-branch KPI report ────────────────────────────────────────

export interface BranchKPI {
  branchName: string;
  activeStudents: number;
  monthlyRevenue: number;
  retentionRate: number;
}

export interface BranchKPIResponseFull {
  consolidated: BranchKPI;
  byBranch: BranchKPI[];
}

// Re-export as BranchKPIResponse for BranchReportsPage
export type BranchKPIResponse = BranchKPIResponseFull;

export function getBranchKPI(params: { from: string; to: string }): Promise<BranchKPIResponse> {
  return api<BranchKPIResponse>(`/api/branches/kpi?from=${params.from}&to=${params.to}`);
}
