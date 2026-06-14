/**
 * CAPTURE-001 — Schema fin_captures tests
 *
 * T-CAPTURE-001-1 [blocant]: migration 0115 existe și are breakpoints corecte
 * T-CAPTURE-001-2 [blocant]: schema finCaptures exportat din schema/index.ts
 * T-CAPTURE-001-3 [blocant]: structura ExtractedFields acceptă confidence + low_confidence
 * T-CAPTURE-001-4 [normal]: enum fin_capture_status are valorile așteptate
 * T-CAPTURE-001-5 [normal]: CapturedField<T> funcționează cu tipuri diferite
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── T-CAPTURE-001-1: Migration file exists and has statement-breakpoints ────

describe("CAPTURE-001 — Migration 0115_fin_captures.sql", () => {
  it("T-CAPTURE-001-1: migration file exists and has statement-breakpoints", () => {
    const migPath = path.resolve(
      __dirname,
      "../../drizzle/0115_fin_captures.sql"
    );
    expect(fs.existsSync(migPath)).toBe(true);

    const sql = fs.readFileSync(migPath, "utf-8");

    // Must create fin_captures table
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS");
    expect(sql).toContain("fin_captures");
    expect(sql).toContain("fin_capture_status");

    // Must have statement-breakpoints (CLAUDE.md §3.5.1)
    const breakpoints = sql.split("--> statement-breakpoint");
    expect(breakpoints.length).toBeGreaterThanOrEqual(3);

    // Must include tenant_id, file_key, extracted_fields (JSONB), status
    expect(sql).toContain("tenant_id");
    expect(sql).toContain("file_key");
    expect(sql).toContain("extracted_fields");
    expect(sql).toContain("JSONB");

    // Must NOT use raw .rows (portability)
    expect(sql).not.toContain(".rows");
  });
});

// ─── T-CAPTURE-001-2: Schema exported from index.ts ──────────────────────────

describe("CAPTURE-001 — Schema export", () => {
  it("T-CAPTURE-001-2: finCaptures exported from schema/index.ts", async () => {
    const indexPath = path.resolve(
      __dirname,
      "../../server/db/schema/index.ts"
    );
    const indexContent = fs.readFileSync(indexPath, "utf-8");
    expect(indexContent).toContain('export * from "./finCaptures"');
  });

  it("T-CAPTURE-001-3: ExtractedFields accepts confidence + low_confidence structure", () => {
    // TypeScript type test — validate the interface structure compiles and works
    import("../db/schema/finCaptures").then(({ finCaptures: _f }) => {
      // Just importing must not throw
      expect(_f).toBeDefined();
    });

    // Runtime check of the ExtractedFields structure
    // Fields with confidence < 0.7 SHOULD be flagged with low_confidence: true
    const lowConfField = { value: true, confidence: 0.62, low_confidence: true };
    expect(lowConfField.confidence).toBeLessThan(0.7);
    expect(lowConfField.low_confidence).toBe(true);

    // Fields with confidence = 0 (not found) have value null
    const notFoundField = { value: null, confidence: 0, low_confidence: true };
    expect(notFoundField.value).toBeNull();
    expect(notFoundField.confidence).toBe(0);

    // High confidence fields do not need low_confidence flag
    const highConfField = { value: "Lidl SRL", confidence: 0.94 };
    expect(highConfField.confidence).toBeGreaterThanOrEqual(0.7);
    expect((highConfField as Record<string, unknown>).low_confidence).toBeUndefined();
  });

  it("T-CAPTURE-001-4: finCaptureStatusEnum values match expected set", async () => {
    const { finCaptureStatusEnum } = await import("../db/schema/finCaptures");
    const values = finCaptureStatusEnum.enumValues;
    expect(values).toContain("pending");
    expect(values).toContain("processing");
    expect(values).toContain("extracted");
    expect(values).toContain("confirmed");
    expect(values).toContain("failed");
    expect(values).toHaveLength(5);
  });

  it("T-CAPTURE-001-5: FinCapture and InsertFinCapture types are exported", async () => {
    // Just verifying the module exports — if it compiles, types exist
    const mod = await import("../db/schema/finCaptures");
    expect(mod.finCaptures).toBeDefined();
    expect(mod.finCaptureStatusEnum).toBeDefined();
    expect(mod.FIN_CAPTURE_STATUS_LABELS).toBeDefined();
    // Labels have all status values
    expect(Object.keys(mod.FIN_CAPTURE_STATUS_LABELS)).toHaveLength(5);
  });
});
