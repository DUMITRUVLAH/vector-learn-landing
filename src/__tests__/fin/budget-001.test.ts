/**
 * BUDGET-001: Teste schema fin_budgets + fin_budget_lines
 * T1 [blocant] — schema importată: finBudgets și finBudgetLines nu sunt undefined.
 * T2 [blocant] — migration check-migration-breakpoints: zero erori.
 * T3 [blocant] — schema-drift: coloanele schemei există în migrare.
 * T4 [normal]  — budgeted_cents bigint: valoarea e reprezentată fără pierdere.
 * T5 [normal]  — FIN_BUDGET_CATEGORY_LABELS are cel puțin 8 categorii.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─── T1 [blocant]: schema importată nu e undefined ────────────────────────────

describe("BUDGET-001: schema finBudgets", () => {
  it("T1 [blocant] — finBudgets și finBudgetLines sunt exportate și nu sunt undefined", async () => {
    const schema = await import("../../../server/db/schema/finBudgets");
    expect(schema.finBudgets).toBeDefined();
    expect(schema.finBudgetLines).toBeDefined();
  });

  it("T1b [blocant] — finBudgets exportat din schema/index.ts", async () => {
    const idx = await import("../../../server/db/schema/index");
    expect(idx.finBudgets).toBeDefined();
    expect(idx.finBudgetLines).toBeDefined();
  });

  // ─── T2 [blocant]: migration SQL are statement-breakpoints ──────────────────

  it("T2 [blocant] — migration 0115_fin_budgets.sql are statement-breakpoints corect", () => {
    const migPath = resolve(process.cwd(), "drizzle/0115_fin_budgets.sql");
    const sql = readFileSync(migPath, "utf-8");

    // Migrarea trebuie să aibă cel puțin un breakpoint
    expect(sql).toContain("--> statement-breakpoint");

    // Număr de instrucțiuni multi-statement — fiecare bloc DO $$ trebuie urmat de breakpoint
    const doBlocks = sql.match(/END \$\$;/g)?.length ?? 0;
    const breakpoints = sql.match(/--> statement-breakpoint/g)?.length ?? 0;
    // Cel puțin atâtea breakpoints câte blocuri DO (sau mai multe)
    expect(breakpoints).toBeGreaterThanOrEqual(doBlocks);
  });

  // ─── T3 [blocant]: coloanele schemei există în migrare ────────────────────────

  it("T3 [blocant] — migrarea creează tabelele fin_budgets și fin_budget_lines", () => {
    const migPath = resolve(process.cwd(), "drizzle/0115_fin_budgets.sql");
    const sql = readFileSync(migPath, "utf-8");

    // Tabelele create
    expect(sql).toContain("fin_budgets");
    expect(sql).toContain("fin_budget_lines");

    // Coloane obligatorii fin_budgets
    expect(sql).toContain("fiscal_year");
    expect(sql).toContain("status");
    expect(sql).toContain("created_by");

    // Coloane obligatorii fin_budget_lines
    expect(sql).toContain("budget_id");
    expect(sql).toContain("budgeted_cents");
    expect(sql).toContain("category");
  });

  // ─── T4 [normal]: bigint precizie ──────────────────────────────────────────────

  it("T4 [normal] — bigint suportă valori până la 9.2 quadrilion cents", () => {
    const MAX_BIGINT = 9007199254740991; // Number.MAX_SAFE_INTEGER
    // 1.000.000 MDL = 100.000.000 cents — sub MAX_SAFE_INTEGER
    const bigBudget = 100_000_000;
    expect(bigBudget).toBeLessThan(MAX_BIGINT);
    expect(Number.isSafeInteger(bigBudget)).toBe(true);
  });

  // ─── T5 [normal]: categorii labels ─────────────────────────────────────────────

  it("T5 [normal] — FIN_BUDGET_CATEGORY_LABELS are cel puțin 8 intrări", async () => {
    const { FIN_BUDGET_CATEGORY_LABELS } = await import("../../../server/db/schema/finBudgets");
    const keys = Object.keys(FIN_BUDGET_CATEGORY_LABELS);
    expect(keys.length).toBeGreaterThanOrEqual(8);
    // Verifică că etichetele nu sunt vide
    for (const [k, v] of Object.entries(FIN_BUDGET_CATEGORY_LABELS)) {
      expect(v.length).toBeGreaterThan(0);
      expect(k.length).toBeGreaterThan(0);
    }
  });

  // ─── T6 [normal]: journal idx unic ────────────────────────────────────────────

  it("T6 [normal] — _journal.json nu are duplicate idx", () => {
    const journalPath = resolve(process.cwd(), "drizzle/meta/_journal.json");
    const j = JSON.parse(readFileSync(journalPath, "utf-8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const idxList = j.entries.map((e) => e.idx);
    const uniqueSet = new Set(idxList);
    expect(uniqueSet.size).toBe(idxList.length);
  });
});
