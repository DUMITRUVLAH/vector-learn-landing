const BASE = "/api/branches";

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

export interface BranchStats {
  branchId: string;
  branchName: string;
  address: string | null;
  isDefault: boolean;
  studentCount: number;
  teacherCount: number;
  revenueCurrentMonth: number;
  lessonCount: number;
}

export interface BranchRollup {
  totalStudents: number;
  totalTeachers: number;
  totalRevenue: number;
  totalBranches: number;
}

export async function listBranches(): Promise<{ items: Branch[] }> {
  const res = await fetch(BASE, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch branches");
  const data = await res.json() as unknown;
  // Guard against unexpected response shape (e.g. mock data in tests)
  if (!data || typeof data !== "object" || !("items" in data) || !Array.isArray((data as { items: unknown }).items)) {
    return { items: [] };
  }
  return data as { items: Branch[] };
}

export async function getBranchStats(): Promise<{ items: BranchStats[] }> {
  const res = await fetch(`${BASE}/stats`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch branch stats");
  return res.json() as Promise<{ items: BranchStats[] }>;
}

export async function getBranchRollup(): Promise<BranchRollup> {
  const res = await fetch(`${BASE}/rollup`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch branch rollup");
  return res.json() as Promise<BranchRollup>;
}

export async function createBranch(data: {
  name: string;
  address?: string | null;
  managerUserId?: string | null;
}): Promise<Branch> {
  const res = await fetch(BASE, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create branch");
  return res.json() as Promise<Branch>;
}

export async function updateBranch(
  id: string,
  data: {
    name?: string;
    address?: string | null;
    managerUserId?: string | null;
    isDefault?: boolean;
  }
): Promise<Branch> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update branch");
  return res.json() as Promise<Branch>;
}

export async function assignManager(branchId: string, managerUserId: string | null): Promise<Branch> {
  return updateBranch(branchId, { managerUserId });
}

export async function deleteBranch(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "Failed to delete branch");
  }
}
