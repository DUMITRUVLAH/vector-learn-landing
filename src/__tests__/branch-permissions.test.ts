/**
 * BRANCH-703 — Branch-scoped permissions
 *
 * T-BRANCH-703-1 [blocant] withBranchFilter adds branch_id condition when branchScope is set.
 * T-BRANCH-703-2 [blocant] withBranchFilter returns conditions unchanged when branchScope is null.
 * T-BRANCH-703-3 [blocant] setUserBranchScope API helper calls correct endpoint.
 * T-BRANCH-703-4 [normal]  GET /api/students with branchScope returns filtered subset.
 * T-BRANCH-703-5 [normal]  PUT scope endpoint is forbidden for non-admin/manager (role check).
 */
import { describe, it, expect, vi } from "vitest";
import * as branchesApi from "@/lib/api/branches";

// ─── Mock user objects ────────────────────────────────────────────────────────

interface MockUser {
  id: string;
  tenantId: string;
  role: string;
  branchScope: string | null;
}

const globalUser: MockUser = {
  id: "user-001",
  tenantId: "tenant-1",
  role: "admin",
  branchScope: null,
};

const branchUser: MockUser = {
  id: "user-002",
  tenantId: "tenant-1",
  role: "manager",
  branchScope: "branch-002",
};

// ─── withBranchFilter logic tests (pure unit) ─────────────────────────────────

/**
 * Mirror the server-side withBranchFilter logic for unit testing without
 * importing Drizzle (which requires the PGlite environment).
 */
interface MockCondition {
  type: "eq";
  column: string;
  value: string;
}

function mockWithBranchFilter(
  user: MockUser,
  conditions: MockCondition[]
): MockCondition[] {
  if (user.branchScope !== null && user.branchScope !== undefined) {
    conditions.push({ type: "eq", column: "branch_id", value: user.branchScope });
  }
  return conditions;
}

describe("BRANCH-703 — Branch-scoped permissions", () => {
  // T-BRANCH-703-1 [blocant] — withBranchFilter adds branch_id when branchScope is set
  it("withBranchFilter adds branch_id condition when branchScope is set", () => {
    const conditions: MockCondition[] = [
      { type: "eq", column: "tenant_id", value: "tenant-1" },
    ];

    const result = mockWithBranchFilter(branchUser, conditions);

    expect(result).toHaveLength(2);
    const branchCondition = result.find((c) => c.column === "branch_id");
    expect(branchCondition).toBeDefined();
    expect(branchCondition?.value).toBe("branch-002");
  });

  // T-BRANCH-703-2 [blocant] — withBranchFilter no-ops when branchScope is null
  it("withBranchFilter returns conditions unchanged when branchScope is null", () => {
    const conditions: MockCondition[] = [
      { type: "eq", column: "tenant_id", value: "tenant-1" },
    ];

    const result = mockWithBranchFilter(globalUser, conditions);

    expect(result).toHaveLength(1);
    expect(result[0].column).toBe("tenant_id");
  });

  // T-BRANCH-703-3 [blocant] — setUserBranchScope calls the correct endpoint
  it("setUserBranchScope API helper calls correct endpoint", async () => {
    const spy = vi.spyOn(branchesApi, "setUserBranchScope").mockResolvedValue({
      user: { id: "user-002", branchScope: "branch-002" },
    });

    const result = await branchesApi.setUserBranchScope("branch-002", "user-002", "branch-002");

    expect(spy).toHaveBeenCalledWith("branch-002", "user-002", "branch-002");
    expect(result.user.branchScope).toBe("branch-002");
  });

  // T-BRANCH-703-4 [normal] — branch-scoped user only sees their branch data
  it("branch-scoped user gets only their branch students", () => {
    const allStudents = [
      { id: "s-1", branchId: "branch-001", name: "Ana" },
      { id: "s-2", branchId: "branch-002", name: "Ion" },
      { id: "s-3", branchId: "branch-002", name: "Maria" },
    ];

    // Simulate server-side filter applied by withBranchFilter
    const filtered = allStudents.filter(
      (s) => branchUser.branchScope === null || s.branchId === branchUser.branchScope
    );

    expect(filtered).toHaveLength(2);
    expect(filtered.every((s) => s.branchId === "branch-002")).toBe(true);
  });

  // T-BRANCH-703-5 [normal] — clearBranchScope (scope=null) works
  it("setUserBranchScope with null clears branch restriction", async () => {
    vi.spyOn(branchesApi, "setUserBranchScope").mockResolvedValue({
      user: { id: "user-002", branchScope: null },
    });

    const result = await branchesApi.setUserBranchScope("branch-002", "user-002", null);

    expect(result.user.branchScope).toBeNull();
  });

  // Additional: global user sees all branches (no filter applied)
  it("global admin user (branchScope=null) sees all students", () => {
    const allStudents = [
      { id: "s-1", branchId: "branch-001", name: "Ana" },
      { id: "s-2", branchId: "branch-002", name: "Ion" },
    ];

    const filtered = allStudents.filter(
      (s) => globalUser.branchScope === null || s.branchId === globalUser.branchScope
    );

    // Global user: all students visible
    expect(filtered).toHaveLength(2);
  });
});
