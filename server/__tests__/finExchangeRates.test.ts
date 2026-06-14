/**
 * @vitest-environment node
 * MULTICURRENCY-001: fin_exchange_rates unit tests
 * Tests: T-MULTI001-1..6
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ─── T-MULTI001-1: Migration file structure ───────────────────────────────────

describe("MULTICURRENCY-001: Migration gate (T-MULTI001-1)", () => {
  it("T-MULTI001-1 [blocant] migration 0115_fin_exchange_rates.sql exists and has correct structure", () => {
    const migPath = path.resolve(
      __dirname,
      "../../drizzle/0115_fin_exchange_rates.sql"
    );
    expect(fs.existsSync(migPath), `Migration file missing: ${migPath}`).toBe(true);

    const sql = fs.readFileSync(migPath, "utf-8");

    // Must create the table
    expect(sql).toContain("fin_exchange_rates");
    expect(sql).toContain("currency_from");
    expect(sql).toContain("currency_to");
    expect(sql).toContain("rate_date");
    expect(sql).toContain("numeric(18, 6)");

    // Must have statement breakpoints between statements
    expect(sql).toContain("--> statement-breakpoint");
  });

  it("T-MULTI001-1b [blocant] _journal.json has entry for idx=115", () => {
    const journalPath = path.resolve(
      __dirname,
      "../../drizzle/meta/_journal.json"
    );
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const entries: Array<{ idx: number; tag: string }> = journal.entries;

    const entry115 = entries.find((e) => e.idx === 115);
    expect(entry115, "Journal entry idx=115 missing").toBeDefined();
    expect(entry115?.tag).toBe("0115_fin_exchange_rates");

    // No duplicate idx
    const indices = entries.map((e) => e.idx);
    const unique = new Set(indices);
    expect(unique.size).toBe(indices.length);
  });
});

// ─── T-MULTI001-6: Schema index export ───────────────────────────────────────

describe("MULTICURRENCY-001: Schema index export (T-MULTI001-6)", () => {
  it("T-MULTI001-6 [normal] server/db/schema/index.ts exports finExchangeRates", () => {
    const indexPath = path.resolve(
      __dirname,
      "../db/schema/index.ts"
    );
    const content = fs.readFileSync(indexPath, "utf-8");
    expect(content).toContain('./finExchangeRates');
  });

  it("T-MULTI001-6b [normal] finExchangeRates schema file exports required symbols", () => {
    const schemaPath = path.resolve(
      __dirname,
      "../db/schema/finExchangeRates.ts"
    );
    const content = fs.readFileSync(schemaPath, "utf-8");

    expect(content).toContain("export const finExchangeRates");
    expect(content).toContain("export type FinExchangeRate");
    expect(content).toContain("export type NewFinExchangeRate");
    expect(content).toContain("currency_from");
    expect(content).toContain("currency_to");
    expect(content).toContain("rate_date");
  });
});

// ─── T-MULTI001-5: DB portability — no raw .execute().rows ───────────────────

describe("MULTICURRENCY-001: DB portability (T-MULTI001-5)", () => {
  it("T-MULTI001-5 [normal] finExchangeRates routes do not use raw .execute().rows", () => {
    const routePath = path.resolve(
      __dirname,
      "../routes/finExchangeRates.ts"
    );
    const content = fs.readFileSync(routePath, "utf-8");

    // Must NOT use raw execute().rows (portability issue)
    expect(content).not.toContain(".execute().rows");
    expect(content).not.toContain(".execute(sql");
  });

  it("T-MULTI001-5b [normal] route is mounted in app.ts", () => {
    const appPath = path.resolve(__dirname, "../app.ts");
    const content = fs.readFileSync(appPath, "utf-8");

    expect(content).toContain("finExchangeRatesRoutes");
    expect(content).toContain("/api/fin/exchange-rates");
  });
});

// ─── T-MULTI001-3: Upsert logic ──────────────────────────────────────────────

describe("MULTICURRENCY-001: Upsert logic (T-MULTI001-5)", () => {
  it("T-MULTI001-5c [normal] routes file uses onConflictDoUpdate for upsert", () => {
    const routePath = path.resolve(
      __dirname,
      "../routes/finExchangeRates.ts"
    );
    const content = fs.readFileSync(routePath, "utf-8");

    // Must use onConflictDoUpdate to handle duplicates per unique index
    expect(content).toContain("onConflictDoUpdate");
  });
});

// ─── T-MULTI001-4: Auth required ─────────────────────────────────────────────

describe("MULTICURRENCY-001: Auth guard (T-MULTI001-4)", () => {
  it("T-MULTI001-4 [blocant] routes use requireAuth middleware", () => {
    const routePath = path.resolve(
      __dirname,
      "../routes/finExchangeRates.ts"
    );
    const content = fs.readFileSync(routePath, "utf-8");

    expect(content).toContain("requireAuth");
    // Auth applied at wildcard level
    expect(content).toContain('"*"');
  });
});
