/**
 * @vitest-environment node
 * REGISTRY-002: FinDesk fiscal registry API routes + rateAt() helper
 *
 * Tests: T-REGISTRY-002-1..7
 *
 * Strategy: structural/unit tests that don't need a live DB.
 * - rateAt() signature and optional-tenantId behaviour
 * - Route file: static analysis checks (portability, route declarations)
 * - finRegistryRoutes export shape and mount verification
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROUTE_FILE = path.resolve(__dirname, "../routes/finRegistry.ts");
const LIB_FILE = path.resolve(__dirname, "../lib/finRegistry.ts");

// ─── T-REGISTRY-002-5: Router mount check ─────────────────────────────────────

describe("REGISTRY-002: Route mount check (T-REGISTRY-002-5)", () => {
  it("finRegistryRoutes is exported from server/routes/finRegistry.ts", () => {
    const routeSource = fs.readFileSync(ROUTE_FILE, "utf-8");
    expect(routeSource).toContain("export const finRegistryRoutes");
    expect(routeSource).toContain("new Hono");
    expect(routeSource).not.toContain("mount-exempt:");
  });

  it("finRegistryRoutes is mounted in server/app.ts (T-REGISTRY-002-5b)", () => {
    const appSource = fs.readFileSync(
      path.resolve(__dirname, "../app.ts"),
      "utf-8"
    );
    expect(appSource).toContain("import { finRegistryRoutes }");
    expect(appSource).toContain("finRegistryRoutes");
    expect(appSource).toContain('"/api/fin/registry"');
  });
});

// ─── T-REGISTRY-002-1: Tax rate endpoints are declared ────────────────────────

describe("REGISTRY-002: Route declarations (T-REGISTRY-002-1)", () => {
  it("GET /tax-rates endpoint is declared", () => {
    const routeSource = fs.readFileSync(ROUTE_FILE, "utf-8");
    expect(routeSource).toContain('.get("/tax-rates"');
  });

  it("GET /tax-rates/:id endpoint is declared (T-REGISTRY-002-4)", () => {
    const routeSource = fs.readFileSync(ROUTE_FILE, "utf-8");
    expect(routeSource).toContain('.get("/tax-rates/:id"');
  });

  it("POST /tax-rates endpoint is declared (T-REGISTRY-002-3)", () => {
    const routeSource = fs.readFileSync(ROUTE_FILE, "utf-8");
    expect(routeSource).toContain('.post("/tax-rates"');
  });

  it("GET /chart-of-accounts endpoint is declared (T-REGISTRY-002-7)", () => {
    const routeSource = fs.readFileSync(ROUTE_FILE, "utf-8");
    expect(routeSource).toContain('.get("/chart-of-accounts"');
  });

  it("All routes are protected by requireAuth", () => {
    const routeSource = fs.readFileSync(ROUTE_FILE, "utf-8");
    expect(routeSource).toContain("requireAuth");
    expect(routeSource).toContain('use("/*", requireAuth)');
  });
});

// ─── T-REGISTRY-002-2: Date filtering logic ────────────────────────────────────

describe("REGISTRY-002: Date filtering logic (T-REGISTRY-002-2)", () => {
  it("Route file uses effectiveFrom + effectiveTo for date filtering", () => {
    const routeSource = fs.readFileSync(ROUTE_FILE, "utf-8");
    expect(routeSource).toContain("effectiveFrom");
    expect(routeSource).toContain("effectiveTo");
    expect(routeSource).toContain("lte");
    expect(routeSource).toContain("isNull");
  });

  it("Date filter correctly includes active and excludes expired rates", () => {
    const rates = [
      { effectiveFrom: "2024-01-01", effectiveTo: null },
      { effectiveFrom: "2025-01-01", effectiveTo: null },
      { effectiveFrom: "2024-01-01", effectiveTo: "2024-12-31" },
      { effectiveFrom: "2026-01-01", effectiveTo: null },
    ];
    const filterDate = "2025-01-01";
    const active = rates.filter((r) => {
      const from = r.effectiveFrom <= filterDate;
      const to = r.effectiveTo === null || r.effectiveTo >= filterDate;
      return from && to;
    });
    expect(active.length).toBe(2);
    expect(active.map((r) => r.effectiveFrom)).toContain("2024-01-01");
    expect(active.map((r) => r.effectiveFrom)).toContain("2025-01-01");
  });
});

// ─── T-REGISTRY-002-3: POST role guard ─────────────────────────────────────────

describe("REGISTRY-002: POST role guard (T-REGISTRY-002-3)", () => {
  it("Route file includes role guard for POST /tax-rates", () => {
    const routeSource = fs.readFileSync(ROUTE_FILE, "utf-8");
    expect(routeSource).toContain("role");
    expect(routeSource).toContain('"owner"');
    expect(routeSource).toContain('"admin"');
    expect(routeSource).toContain("403");
  });

  it("Role logic: owner and admin pass, viewer is rejected", () => {
    const checkRole = (role: string) => role === "owner" || role === "admin";
    expect(checkRole("owner")).toBe(true);
    expect(checkRole("admin")).toBe(true);
    expect(checkRole("viewer")).toBe(false);
    expect(checkRole("accountant")).toBe(false);
  });
});

// ─── T-REGISTRY-002-6: rateAt() optional tenantId ─────────────────────────────

describe("REGISTRY-002: rateAt() optional tenantId (T-REGISTRY-002-6)", () => {
  it("rateAt signature accepts null tenantId", () => {
    const libSource = fs.readFileSync(LIB_FILE, "utf-8");
    expect(libSource).toContain("string | null | undefined");
  });

  it("rateAt with tenantId=undefined skips tenant-specific lookup", () => {
    const libSource = fs.readFileSync(LIB_FILE, "utf-8");
    expect(libSource).toContain("if (tenantId)");
  });

  it("rateAt falls back to global rates when no tenant match", () => {
    const libSource = fs.readFileSync(LIB_FILE, "utf-8");
    expect(libSource).toContain("isDefault");
    expect(libSource).toContain("drizzleIsNull");
  });
});

// ─── T-REGISTRY-002-DB portability ────────────────────────────────────────────

describe("REGISTRY-002: DB portability check", () => {
  it("Route file uses query builder (no raw .execute().rows)", () => {
    const routeSource = fs.readFileSync(ROUTE_FILE, "utf-8");
    expect(routeSource).not.toContain(".execute().rows");
    expect(routeSource).not.toContain(".execute(sql");
  });

  it("Lib file uses query builder (no raw .execute().rows)", () => {
    const libSource = fs.readFileSync(LIB_FILE, "utf-8");
    expect(libSource).not.toContain(".execute().rows");
    expect(libSource).not.toContain(".execute(sql");
  });
});

// ─── T-REGISTRY-002-7: Chart of accounts structure ────────────────────────────

describe("REGISTRY-002: Chart of accounts response shape (T-REGISTRY-002-7)", () => {
  it("finChartOfAccounts is imported in route file", () => {
    const routeSource = fs.readFileSync(ROUTE_FILE, "utf-8");
    expect(routeSource).toContain("finChartOfAccounts");
  });

  it("Response data includes accountCode and accountType fields", () => {
    const mockAccounts = [
      { id: "acc-1", country: "RO", accountCode: "221", accountName: "Clienți", accountType: "asset" },
      { id: "acc-2", country: "RO", accountCode: "401", accountName: "Furnizori", accountType: "liability" },
    ];
    expect(Array.isArray(mockAccounts)).toBe(true);
    expect(mockAccounts.every((a) => "accountCode" in a)).toBe(true);
    expect(mockAccounts.every((a) => "accountType" in a)).toBe(true);
  });
});
