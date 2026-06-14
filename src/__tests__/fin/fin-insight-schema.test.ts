/**
 * @vitest-environment node
 *
 * INSIGHT-001: Schema tests — fin_saved_views + fin_narratives
 *
 * T-INSIGHT-001-1 [blocant]: migration file 0115_fin_insight_schema.sql exists + correct content
 * T-INSIGHT-001-2 [blocant]: _journal.json has idx=115 with tag "0115_fin_insight_schema"
 * T-INSIGHT-001-3 [blocant]: finSavedViews and finNarratives exported from schema/index.ts
 * T-INSIGHT-001-4 [normal]: finSavedViews has required columns
 * T-INSIGHT-001-5 [normal]: finNarratives has required columns
 */

import { describe, it, expect } from "vitest";
import * as path from "path";
import * as fs from "fs";

const DRIZZLE_DIR = path.resolve(__dirname, "../../../drizzle");
const JOURNAL_PATH = path.join(DRIZZLE_DIR, "meta/_journal.json");
const MIGRATION_FILE = path.join(DRIZZLE_DIR, "0115_fin_insight_schema.sql");

// ─── T-INSIGHT-001-1 [blocant]: migration file exists ────────────────────────
describe("INSIGHT-001 — migration discipline", () => {
  it("T-INSIGHT-001-1 [blocant]: migration 0115_fin_insight_schema.sql exists with correct content", () => {
    expect(fs.existsSync(MIGRATION_FILE)).toBe(true);

    const content = fs.readFileSync(MIGRATION_FILE, "utf-8");
    expect(content).toContain("CREATE TABLE");
    expect(content).toContain('"fin_saved_views"');
    expect(content).toContain('"fin_narratives"');
    // Verify enums
    expect(content).toContain('"fin_metric"');
    expect(content).toContain('"fin_period"');
  });

  // ─── T-INSIGHT-001-2 [blocant]: _journal.json has entry ──────────────────
  it("T-INSIGHT-001-2 [blocant]: _journal.json has idx=115 with tag 0115_fin_insight_schema", () => {
    expect(fs.existsSync(JOURNAL_PATH)).toBe(true);

    const journal = JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf-8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };

    const entry = journal.entries.find((e) => e.idx === 115);
    expect(entry).toBeDefined();
    expect(entry?.tag).toBe("0115_fin_insight_schema");

    // No duplicate idx
    const idxCounts = journal.entries.reduce<Record<number, number>>((acc, e) => {
      acc[e.idx] = (acc[e.idx] ?? 0) + 1;
      return acc;
    }, {});
    const duplicates = Object.entries(idxCounts).filter(([, count]) => count > 1);
    expect(duplicates).toHaveLength(0);
  });
});

// ─── T-INSIGHT-001-3 [blocant]: schema exports ───────────────────────────────
describe("INSIGHT-001 — schema exports", () => {
  it("T-INSIGHT-001-3 [blocant]: finSavedViews and finNarratives exported from schema/index.ts", async () => {
    const schema = await import("../../../server/db/schema/index");
    expect((schema as Record<string, unknown>)["finSavedViews"]).toBeDefined();
    expect((schema as Record<string, unknown>)["finNarratives"]).toBeDefined();
  });

  // ─── T-INSIGHT-001-4 [normal]: finSavedViews columns ────────────────────
  it("T-INSIGHT-001-4 [normal]: finSavedViews has required columns", async () => {
    const { finSavedViews } = await import("../../../server/db/schema/finInsight");
    const cols = Object.keys(finSavedViews);
    expect(cols).toContain("id");
    expect(cols).toContain("tenantId");
    expect(cols).toContain("userId");
    expect(cols).toContain("name");
    expect(cols).toContain("metric");
    expect(cols).toContain("period");
    expect(cols).toContain("groupBy");
    expect(cols).toContain("filters");
    expect(cols).toContain("isDefault");
    expect(cols).toContain("isPublic");
  });

  // ─── T-INSIGHT-001-5 [normal]: finNarratives columns ────────────────────
  it("T-INSIGHT-001-5 [normal]: finNarratives has required columns", async () => {
    const { finNarratives } = await import("../../../server/db/schema/finInsight");
    const cols = Object.keys(finNarratives);
    expect(cols).toContain("id");
    expect(cols).toContain("tenantId");
    expect(cols).toContain("authorId");
    expect(cols).toContain("month");
    expect(cols).toContain("title");
    expect(cols).toContain("body");
    expect(cols).toContain("generatedBy");
    expect(cols).toContain("sentiment");
    expect(cols).toContain("publishedAt");
  });
});
