/**
 * CALENDAR-001: Schema fin_obligations + fin_period_locks
 *
 * T-CALENDAR-001-1 [blocant]: Migration SQL exists with CREATE TABLE statements
 * T-CALENDAR-001-2 [blocant]: _journal.json has entry with idx=115 for fin_calendar
 * T-CALENDAR-001-3 [blocant]: finObligations and finPeriodLocks exported from schema/index
 * T-CALENDAR-001-4 [normal]: finObligations table name is fin_obligations
 * T-CALENDAR-001-5 [normal]: finPeriodLocks table name is fin_period_locks
 * T-CALENDAR-001-6 [normal]: migration SQL has statement-breakpoints
 * T-CALENDAR-001-7 [normal]: label maps are exported with correct Romanian strings
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../../../server/db/schema/index";
import {
  finObligations,
  finPeriodLocks,
  FIN_OBLIGATION_TYPE_LABELS,
  FIN_OBLIGATION_STATUS_LABELS,
} from "../../../server/db/schema/finCalendar";

// In node environment, import.meta.dirname resolves correctly
const ROOT = path.resolve(import.meta.dirname ?? __dirname, "../../../");

describe("CALENDAR-001 — Schema fin_calendar (T-CALENDAR-001-*)", () => {
  // T-CALENDAR-001-1 [blocant]
  it("T-CALENDAR-001-1 [blocant] migration 0115_fin_calendar.sql exists with CREATE TABLE statements", () => {
    const migPath = path.join(ROOT, "drizzle", "0115_fin_calendar.sql");
    expect(fs.existsSync(migPath), `Migration file not found at: ${migPath}`).toBe(true);
    const sql = fs.readFileSync(migPath, "utf-8");
    expect(sql).toContain('CREATE TABLE "fin_obligations"');
    expect(sql).toContain('CREATE TABLE "fin_period_locks"');
  });

  // T-CALENDAR-001-2 [blocant]
  it("T-CALENDAR-001-2 [blocant] _journal.json contains entry idx=115 tagged fin_calendar", () => {
    const journalPath = path.join(ROOT, "drizzle", "meta", "_journal.json");
    expect(fs.existsSync(journalPath)).toBe(true);
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const entry = journal.entries.find((e) => e.idx === 115);
    expect(entry, "No entry with idx=115 in _journal.json").toBeTruthy();
    expect(entry?.tag).toContain("fin_calendar");
    // No duplicate idx 115
    const idx115s = journal.entries.filter((e) => e.idx === 115);
    expect(idx115s.length).toBe(1);
  });

  // T-CALENDAR-001-3 [blocant]
  it("T-CALENDAR-001-3 [blocant] finObligations and finPeriodLocks exported from schema/index", () => {
    expect(
      (schema as Record<string, unknown>).finObligations,
      "finObligations is undefined — check export in server/db/schema/index.ts"
    ).toBeTruthy();
    expect(
      (schema as Record<string, unknown>).finPeriodLocks,
      "finPeriodLocks is undefined — check export in server/db/schema/index.ts"
    ).toBeTruthy();
  });

  // T-CALENDAR-001-4 [normal]
  it("T-CALENDAR-001-4 [normal] finObligations table name is fin_obligations", () => {
    expect(finObligations).toBeTruthy();
    const { name } = getTableConfig(finObligations);
    expect(name).toBe("fin_obligations");
  });

  // T-CALENDAR-001-5 [normal]
  it("T-CALENDAR-001-5 [normal] finPeriodLocks table name is fin_period_locks", () => {
    expect(finPeriodLocks).toBeTruthy();
    const { name } = getTableConfig(finPeriodLocks);
    expect(name).toBe("fin_period_locks");
  });

  // T-CALENDAR-001-6 [normal]
  it("T-CALENDAR-001-6 [normal] migration SQL contains statement-breakpoints", () => {
    const migPath = path.join(ROOT, "drizzle", "0115_fin_calendar.sql");
    const sql = fs.readFileSync(migPath, "utf-8");
    expect(sql).toContain("--> statement-breakpoint");
  });

  // T-CALENDAR-001-7 [normal]
  it("T-CALENDAR-001-7 [normal] label maps have correct Romanian strings", () => {
    expect(FIN_OBLIGATION_TYPE_LABELS.tva_md).toBe("TVA (MD)");
    expect(FIN_OBLIGATION_STATUS_LABELS.pending).toBe("De plătit");
    expect(FIN_OBLIGATION_STATUS_LABELS.paid).toBe("Plătit");
    expect(FIN_OBLIGATION_STATUS_LABELS.overdue).toBe("Restantă");
  });
});
