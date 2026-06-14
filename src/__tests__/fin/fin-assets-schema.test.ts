/**
 * @vitest-environment node
 *
 * ASSET-001: Schema tests — fin_assets + fin_depreciation_entries
 *
 * T-ASSET-001-1 [blocant]: migration file 0115_fin_assets.sql exists
 * T-ASSET-001-2 [blocant]: _journal.json has idx=115 with correct tag
 * T-ASSET-001-3 [blocant]: finAssets and finDepreciationEntries exported from schema/index.ts
 */

import { describe, it, expect } from "vitest";
import * as path from "path";
import * as fs from "fs";

const DRIZZLE_DIR = path.resolve(__dirname, "../../../drizzle");
const JOURNAL_PATH = path.join(DRIZZLE_DIR, "meta/_journal.json");

// T-ASSET-001-1 [blocant]
describe("ASSET-001 — migration discipline", () => {
  it("T-ASSET-001-1 [blocant]: migration file 0115_fin_assets.sql exists", () => {
    const migrationPath = path.join(DRIZZLE_DIR, "0115_fin_assets.sql");
    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("CREATE TABLE");
    expect(content).toContain('"fin_assets"');
    expect(content).toContain('"fin_depreciation_entries"');
  });

  // T-ASSET-001-2 [blocant]
  it("T-ASSET-001-2 [blocant]: _journal.json has idx=115 with tag 0115_fin_assets", () => {
    expect(fs.existsSync(JOURNAL_PATH)).toBe(true);
    const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf-8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    const entry = journal.entries.find((e) => e.idx === 115);
    expect(entry).toBeDefined();
    expect(entry?.tag).toBe("0115_fin_assets");

    // No duplicate idx values
    const idxCounts = journal.entries.reduce(
      (acc, e) => {
        acc[e.idx] = (acc[e.idx] ?? 0) + 1;
        return acc;
      },
      {} as Record<number, number>
    );
    const duplicates = Object.entries(idxCounts).filter(([, count]) => count > 1);
    expect(duplicates).toHaveLength(0);
  });
});

// T-ASSET-001-3 [blocant] — must run in node environment (server imports)
describe("ASSET-001 — schema exports", () => {
  it("T-ASSET-001-3 [blocant]: finAssets exported from schema/index.ts", async () => {
    const schema = await import("../../../server/db/schema/index");
    expect(schema.finAssets).toBeDefined();
    expect(typeof schema.finAssets).toBe("object");
  });

  it("T-ASSET-001-3b [blocant]: finDepreciationEntries exported from schema/index.ts", async () => {
    const schema = await import("../../../server/db/schema/index");
    expect(schema.finDepreciationEntries).toBeDefined();
    expect(typeof schema.finDepreciationEntries).toBe("object");
  });

  it("T-ASSET-001-4 [normal]: depreciation method enum has linear and declining_balance", async () => {
    const { finDepreciationMethodEnum } = await import(
      "../../../server/db/schema/finAssets"
    );
    const values = finDepreciationMethodEnum.enumValues;
    expect(values).toContain("linear");
    expect(values).toContain("declining_balance");
  });

  it("T-ASSET-001-5 [normal]: asset status enum has all 4 statuses", async () => {
    const { finAssetStatusEnum } = await import(
      "../../../server/db/schema/finAssets"
    );
    const values = finAssetStatusEnum.enumValues;
    expect(values).toContain("active");
    expect(values).toContain("fully_depreciated");
    expect(values).toContain("sold");
    expect(values).toContain("scrapped");
  });

  it("T-ASSET-001 [normal]: label maps are defined", async () => {
    const { FIN_DEPRECIATION_METHOD_LABELS, FIN_ASSET_STATUS_LABELS } =
      await import("../../../server/db/schema/finAssets");
    expect(FIN_DEPRECIATION_METHOD_LABELS.linear).toBe("Liniară");
    expect(FIN_DEPRECIATION_METHOD_LABELS.declining_balance).toBe("Degresivă");
    expect(FIN_ASSET_STATUS_LABELS.active).toBe("Activ");
    expect(FIN_ASSET_STATUS_LABELS.fully_depreciated).toBe("Amortizat complet");
  });
});
