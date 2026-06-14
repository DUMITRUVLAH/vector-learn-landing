/**
 * SPLIT-001: tenants.app_kind schema tests
 * Verifies the column is declared in schema and accessible via Drizzle.
 */
import { describe, it, expect } from "vitest";
import { tenants } from "../../../server/db/schema/tenants";

describe("SPLIT-001 — tenants.app_kind", () => {
  it("declares appKind column in Drizzle table object", () => {
    // Drizzle table columns are accessible as keys on the table object
    expect("appKind" in tenants).toBe(true);
  });

  it("the appKind column has DB name 'app_kind'", () => {
    const col = (tenants as unknown as Record<string, { name?: string }>)["appKind"];
    expect(col).toBeDefined();
    // Drizzle PgColumn has a .name property equal to the SQL column name
    expect(col.name).toBe("app_kind");
  });

  it("compile-time: Tenant $inferSelect includes appKind", () => {
    // This just validates schema column access at the TypeScript + runtime level
    type TenantCols = typeof tenants.$inferSelect;
    // If appKind weren't declared, TS would error here:
    const _test: keyof TenantCols = "appKind";
    expect(_test).toBe("appKind");
  });
});
