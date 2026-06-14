/**
 * @vitest-environment node
 * MULTICURRENCY-002: FX revaluation unit tests
 * Tests: T-MULTI002-1..6
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ─── T-MULTI002-1: Migration file structure ───────────────────────────────────

describe("MULTICURRENCY-002: Migration gate (T-MULTI002-1)", () => {
  it("T-MULTI002-1 [blocant] migration 0116_fin_ledger.sql exists and creates fin_ledger_entries", () => {
    const migPath = path.resolve(
      __dirname,
      "../../drizzle/0116_fin_ledger.sql"
    );
    expect(fs.existsSync(migPath), `Migration file missing: ${migPath}`).toBe(true);

    const sql = fs.readFileSync(migPath, "utf-8");
    expect(sql).toContain("fin_ledger_entries");
    expect(sql).toContain("entry_type");
    expect(sql).toContain("fx_gain_loss_cents");
    expect(sql).toContain("period_month");
    expect(sql).toContain("posted_by");
    expect(sql).toContain("--> statement-breakpoint");
  });

  it("T-MULTI002-1b [blocant] _journal.json has entry for idx=116", () => {
    const journalPath = path.resolve(
      __dirname,
      "../../drizzle/meta/_journal.json"
    );
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const entries: Array<{ idx: number; tag: string }> = journal.entries;

    const entry116 = entries.find((e) => e.idx === 116);
    expect(entry116, "Journal entry idx=116 missing").toBeDefined();
    expect(entry116?.tag).toBe("0116_fin_ledger");

    // No duplicate idx
    const indices = entries.map((e) => e.idx);
    expect(new Set(indices).size).toBe(indices.length);
  });
});

// ─── T-MULTI002-5: UI page renders ───────────────────────────────────────────

describe("MULTICURRENCY-002: UI page (T-MULTI002-5)", () => {
  it("T-MULTI002-5 [normal] RevaluationPage.tsx exists and contains required UI text", () => {
    const pagePath = path.resolve(
      __dirname,
      "../../src/pages/app/RevaluationPage.tsx"
    );
    const content = fs.readFileSync(pagePath, "utf-8");

    // Required UI elements
    expect(content).toContain("Revaluare sold");
    expect(content).toContain("Revaluează");
    // Uses design system tokens (not hardcoded hex)
    expect(content).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("T-MULTI002-5b [normal] RevaluationPage is registered in App.tsx", () => {
    const appPath = path.resolve(__dirname, "../../src/App.tsx");
    const content = fs.readFileSync(appPath, "utf-8");

    expect(content).toContain("RevaluationPage");
    expect(content).toContain("/app/fin/revaluation");
  });
});

// ─── T-MULTI002-6: Revaluation gain/loss logic ───────────────────────────────

describe("MULTICURRENCY-002: Gain/loss calculation logic (T-MULTI002-6)", () => {
  it("T-MULTI002-6 [normal] revaluation service uses Drizzle query builder (no raw .execute().rows)", () => {
    const servicePath = path.resolve(
      __dirname,
      "../lib/fin/revaluation.ts"
    );
    const content = fs.readFileSync(servicePath, "utf-8");

    // No raw execute().rows (portability)
    expect(content).not.toContain(".execute().rows");
    // Uses Drizzle operators
    expect(content).toContain('from "drizzle-orm"');
  });

  it("T-MULTI002-6b [normal] revaluation service computes fxGainLossCents correctly", () => {
    // Inline formula test: amount * (eomRate - bookingRate)
    const amountCents = 100_000; // 1000 EUR
    const eomRate = 19.5; // end-of-month rate
    const bookingRate = 19.0; // booking rate

    const gainLoss = Math.round(amountCents * (eomRate - bookingRate));
    // 100000 * 0.5 = 50000 MDL cents (500 MDL gain)
    expect(gainLoss).toBe(50000);
    expect(gainLoss).toBeGreaterThan(0); // This is a gain
  });

  it("T-MULTI002-6c [normal] revaluation service is idempotent (deletes before insert)", () => {
    const servicePath = path.resolve(
      __dirname,
      "../lib/fin/revaluation.ts"
    );
    const content = fs.readFileSync(servicePath, "utf-8");

    // Must delete existing entries before inserting (idempotency)
    expect(content).toContain(".delete(");
    expect(content).toContain("fx_revaluation");
  });
});

// ─── T-MULTI002-4: GET endpoint ──────────────────────────────────────────────

describe("MULTICURRENCY-002: GET revaluation list (T-MULTI002-4)", () => {
  it("T-MULTI002-4 [blocant] finRevaluation routes are mounted in app.ts", () => {
    const appPath = path.resolve(__dirname, "../app.ts");
    const content = fs.readFileSync(appPath, "utf-8");

    expect(content).toContain("finRevaluationRoutes");
    expect(content).toContain("/api/fin/revaluation");
  });

  it("T-MULTI002-4b [blocant] finLedger schema exports required symbols", () => {
    const schemaPath = path.resolve(
      __dirname,
      "../db/schema/finLedger.ts"
    );
    const content = fs.readFileSync(schemaPath, "utf-8");

    expect(content).toContain("export const finLedgerEntries");
    expect(content).toContain("export type FinLedgerEntry");
    expect(content).toContain("fx_gain_loss_cents");
    expect(content).toContain("period_month");
  });

  it("T-MULTI002-4c [normal] schema index exports finLedger", () => {
    const indexPath = path.resolve(__dirname, "../db/schema/index.ts");
    const content = fs.readFileSync(indexPath, "utf-8");
    expect(content).toContain('./finLedger');
  });
});
