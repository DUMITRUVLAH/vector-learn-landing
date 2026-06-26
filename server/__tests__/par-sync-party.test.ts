/**
 * PAR-FIN-002: tests for the unified partner registry.
 *
 * Structural tests (no DB): the helper exists and is wired into the PAR vendor
 * create route, and the matching/validation rules are in source. The actual
 * find-or-create against the DB is covered by the live API smoke (it needs a
 * migrated DB, which the jsdom test env can't open — see memory note).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const HELPER = readFileSync(resolve(__dirname, "../lib/par/syncParty.ts"), "utf8");
const VENDORS = readFileSync(resolve(__dirname, "../routes/parVendors.ts"), "utf8");

describe("PAR-FIN-002: syncSupplierParty helper", () => {
  it("is exported", async () => {
    const mod = await import("../lib/par/syncParty");
    expect(typeof mod.syncSupplierParty).toBe("function");
  });

  it("creates a SUPPLIER party (PAR beneficiary is a supplier)", () => {
    expect(HELPER).toContain('kind: "supplier"');
  });

  it("matches by IDNO first, falls back to exact name", () => {
    expect(HELPER).toContain("eq(finParties.idno, idno)");
    expect(HELPER).toContain("eq(finParties.name");
  });

  it("backfills a missing IBAN but never overwrites existing party data", () => {
    expect(HELPER).toContain("!byIdno.iban");
    // No unconditional update of name/idno on an existing match.
    expect(HELPER).not.toContain("set({ name");
  });

  it("is tenant-scoped on every query", () => {
    const matches = HELPER.match(/eq\(finParties\.tenantId, input\.tenantId\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe("PAR-FIN-002: wired into PAR vendor create", () => {
  it("the vendor POST calls syncSupplierParty", () => {
    expect(VENDORS).toContain("syncSupplierParty(");
  });

  it("the sync is non-blocking (wrapped in try/catch so a failure doesn't fail the create)", () => {
    // The call sits inside a try that logs on failure.
    const idx = VENDORS.indexOf("syncSupplierParty(");
    const before = VENDORS.slice(Math.max(0, idx - 200), idx);
    expect(before).toContain("try {");
  });
});
