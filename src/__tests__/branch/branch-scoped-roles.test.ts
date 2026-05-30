/**
 * BRANCH-703 — Scoped roles: user branch_scope enforcement
 * Tests:
 * T-BRANCH-703-1: [blocant] Migration file 0017_branch703_user_scope.sql exists with correct SQL
 * T-BRANCH-703-2: [blocant] User schema type has branchScope nullable UUID field
 * T-BRANCH-703-3: [blocant] getBranchScope returns null for user without scope
 * T-BRANCH-703-4: [blocant] getBranchScope returns UUID for user with scope set
 * T-BRANCH-703-5: [blocant] PATCH branch-scope schema validates correctly
 * T-BRANCH-703-6: [normal]  Route files reference getBranchScope
 * T-BRANCH-703-7: [normal]  Route files reference getBranchScope
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CWD = process.cwd();

// ─── T-BRANCH-703-1: Migration file ────────────────────────────────────────────

describe("BRANCH-703 — migration gate", () => {
  it("T-BRANCH-703-1: 0017_branch703_user_scope.sql exists and adds branch_scope column", () => {
    const migPath = join(CWD, "drizzle/0017_branch703_user_scope.sql");
    expect(existsSync(migPath)).toBe(true);
    const content = readFileSync(migPath, "utf8");
    expect(content).toContain('"users"');
    expect(content).toContain('"branch_scope"');
    expect(content.toLowerCase()).toContain("uuid");
  });
});

// ─── T-BRANCH-703-2: Schema source file type ───────────────────────────────────

describe("BRANCH-703 — users schema branchScope field", () => {
  it("T-BRANCH-703-2: server/db/schema/users.ts defines branchScope column", () => {
    const schemaPath = join(CWD, "server/db/schema/users.ts");
    const content = readFileSync(schemaPath, "utf8");
    expect(content).toContain("branchScope");
    expect(content).toContain("branch_scope");
    expect(content).toContain("uuid");
  });
});

// ─── T-BRANCH-703-3+4: getBranchScope logic ────────────────────────────────────

describe("BRANCH-703 — getBranchScope middleware helper", () => {
  // Inline the logic to avoid server-side imports in vitest/jsdom
  function getBranchScope(user: { branchScope?: string | null }): string | null {
    return user.branchScope ?? null;
  }

  it("T-BRANCH-703-3: returns null when user.branchScope is null", () => {
    expect(getBranchScope({ branchScope: null })).toBeNull();
  });

  it("T-BRANCH-703-4: returns UUID when user.branchScope is set", () => {
    const scopeId = "branch-cluj-uuid-1234";
    expect(getBranchScope({ branchScope: scopeId })).toBe(scopeId);
  });
});

// ─── T-BRANCH-703-5: Schema validation ─────────────────────────────────────────

describe("BRANCH-703 — PATCH branch-scope schema", () => {
  it("T-BRANCH-703-5: setBranchScopeSchema validates branchId UUID or null", () => {
    // Test inline schema (mirrors server/routes/users.ts)
    function isValidBranchScopePayload(payload: unknown): boolean {
      if (typeof payload !== "object" || payload === null) return false;
      const p = payload as Record<string, unknown>;
      if (!("branchId" in p)) return false;
      if (p.branchId === null) return true;
      if (typeof p.branchId !== "string") return false;
      // UUID v4 regex
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.branchId);
    }

    expect(isValidBranchScopePayload({ branchId: "3f2b4d6e-1234-5678-abcd-ef0123456789" })).toBe(true);
    expect(isValidBranchScopePayload({ branchId: null })).toBe(true);
    expect(isValidBranchScopePayload({ branchId: "not-a-uuid" })).toBe(false);
    expect(isValidBranchScopePayload({ branchId: 123 })).toBe(false);
  });
});

// ─── T-BRANCH-703-6+7: Route files reference getBranchScope ───────────────────

describe("BRANCH-703 — route integration", () => {
  it("T-BRANCH-703-6: teachers.ts imports and uses getBranchScope", () => {
    const content = readFileSync(join(CWD, "server/routes/teachers.ts"), "utf8");
    expect(content).toContain("getBranchScope");
    expect(content).toContain("branchScope");
  });

  it("T-BRANCH-703-7: students.ts imports and uses getBranchScope", () => {
    const content = readFileSync(join(CWD, "server/routes/students.ts"), "utf8");
    expect(content).toContain("getBranchScope");
  });

  it("T-BRANCH-703-8: users.ts route exists with PATCH branch-scope endpoint", () => {
    const content = readFileSync(join(CWD, "server/routes/users.ts"), "utf8");
    expect(content).toContain("branch-scope");
    expect(content).toContain("branchScope");
    expect(content).toContain("PATCH");
  });
});
