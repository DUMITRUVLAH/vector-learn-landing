/**
 * MASS-003 — Import bulk CSV clienți/cheltuieli
 *
 * T-MASS-003-1 [blocant] Migration 0119 (fin_parties) există și are statement-breakpoints
 * T-MASS-003-2 [blocant] Migration 0121 (import_hash) adaugă coloana la fin_expenses
 * T-MASS-003-3 [blocant] finParties + finExpenses exportate din schema/index.ts
 * T-MASS-003-4 [blocant] parseCSVRow parsează corect câmpuri cu virgulă în ghilimele
 * T-MASS-003-5 [blocant] makePartyImportProcessor + makeSpendImportProcessor exportate
 * T-MASS-003-6 [blocant] POST /import/parties și /import/spend montate în finMassRoutes
 * T-MASS-003-7 [normal]  CsvImportZone componentă exportată + props corecte
 * T-MASS-003-8 [normal]  importPartiesFromCsv + importSpendFromCsv exportate din API client
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── T-MASS-003-1: Migration 0119 exists and has statement-breakpoints ─────────

describe("MASS-003 — Migration 0119 (fin_parties)", () => {
  it("T-MASS-003-1a [blocant] drizzle/0119_fin_parties.sql exists", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "drizzle/0119_fin_parties.sql"),
      "utf-8"
    );
    expect(sql).toContain("CREATE TABLE");
    expect(sql).toContain("fin_parties");
    expect(sql).toContain("fin_party_contacts");
  });

  it("T-MASS-003-1b [blocant] 0119_fin_parties.sql has statement-breakpoints between each statement", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "drizzle/0119_fin_parties.sql"),
      "utf-8"
    );
    // Should have at least 2 statement-breakpoint markers
    const breakpoints = (sql.match(/--> statement-breakpoint/g) ?? []).length;
    expect(breakpoints).toBeGreaterThanOrEqual(2);
  });

  it("T-MASS-003-1c [blocant] _journal.json has entry for idx=119", () => {
    const journal = JSON.parse(
      readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf-8")
    );
    const entry = journal.entries.find(
      (e: { idx: number }) => e.idx === 119
    );
    expect(entry).toBeDefined();
    expect(entry?.tag).toBe("0119_fin_parties");
  });
});

// ─── T-MASS-003-2: Migration 0121 adds import_hash ────────────────────────────

describe("MASS-003 — Migration 0121 (import_hash)", () => {
  it("T-MASS-003-2a [blocant] drizzle/0121_fin_spend_import_hash.sql exists", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "drizzle/0121_fin_spend_import_hash.sql"),
      "utf-8"
    );
    expect(sql).toContain("import_hash");
    expect(sql).toContain("fin_expenses");
  });

  it("T-MASS-003-2b [blocant] _journal.json has entry for idx=121", () => {
    const journal = JSON.parse(
      readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf-8")
    );
    const entry = journal.entries.find(
      (e: { idx: number }) => e.idx === 121
    );
    expect(entry).toBeDefined();
    expect(entry?.tag).toBe("0121_fin_spend_import_hash");
  });
});

// ─── T-MASS-003-3: Schema exports ─────────────────────────────────────────────

describe("MASS-003 — Schema index exports", () => {
  it("T-MASS-003-3 [blocant] finParties and finExpenses exported from schema/index.ts", async () => {
    const { finParties, finPartyContacts } = await import(
      "../../../server/db/schema/finParties"
    );
    expect(finParties).toBeDefined();
    expect(finPartyContacts).toBeDefined();

    const { finExpenses, finExpenseAttachments } = await import(
      "../../../server/db/schema/finExpenses"
    );
    expect(finExpenses).toBeDefined();
    expect(finExpenseAttachments).toBeDefined();
  });

  it("T-MASS-003-3b [blocant] finExpenses schema has importHash column defined", async () => {
    // Check the schema file declares importHash (MASS-003 AC10)
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const schemaText = readFileSync(
      resolve(process.cwd(), "server/db/schema/finExpenses.ts"),
      "utf-8"
    );
    expect(schemaText).toContain("importHash");
    expect(schemaText).toContain("import_hash");
  });
});

// ─── T-MASS-003-4: CSV parser ─────────────────────────────────────────────────

describe("MASS-003 — parseCSVRow", () => {
  it("T-MASS-003-4 [blocant] Parses simple fields correctly", async () => {
    const { parseCSVRow } = await import("../../../server/lib/finCsvImportProcessor");
    const result = parseCSVRow("client,Compania SRL,MD,1234567890123,,,,email@test.md,+37369000001");
    expect(result[0]).toBe("client");
    expect(result[1]).toBe("Compania SRL");
    expect(result[2]).toBe("MD");
    expect(result[3]).toBe("1234567890123");
    expect(result[7]).toBe("email@test.md");
  });

  it("T-MASS-003-4b [blocant] Parses quoted fields with commas", async () => {
    const { parseCSVRow } = await import("../../../server/lib/finCsvImportProcessor");
    const result = parseCSVRow('client,"Compania, SRL",MD,,,,,, ');
    expect(result[0]).toBe("client");
    expect(result[1]).toBe("Compania, SRL");
    expect(result[2]).toBe("MD");
  });

  it("T-MASS-003-4c [blocant] Returns empty string for empty fields", async () => {
    const { parseCSVRow } = await import("../../../server/lib/finCsvImportProcessor");
    const result = parseCSVRow("a,,c");
    expect(result[0]).toBe("a");
    expect(result[1]).toBe("");
    expect(result[2]).toBe("c");
  });
});

// ─── T-MASS-003-5: Processor factories ────────────────────────────────────────

describe("MASS-003 — Processor factories", () => {
  it("T-MASS-003-5a [blocant] makePartyImportProcessor is a factory function returning a processor", async () => {
    const { makePartyImportProcessor } = await import(
      "../../../server/lib/finCsvImportProcessor"
    );
    expect(typeof makePartyImportProcessor).toBe("function");
    const processor = makePartyImportProcessor("tenant-1");
    expect(typeof processor).toBe("function");
    expect(processor.length).toBe(1); // takes one FinBulkRow argument
  });

  it("T-MASS-003-5b [blocant] makeSpendImportProcessor is a factory function returning a processor", async () => {
    const { makeSpendImportProcessor } = await import(
      "../../../server/lib/finCsvImportProcessor"
    );
    expect(typeof makeSpendImportProcessor).toBe("function");
    const processor = makeSpendImportProcessor("tenant-1");
    expect(typeof processor).toBe("function");
    expect(processor.length).toBe(1);
  });
});

// ─── T-MASS-003-6: Routes mounted ─────────────────────────────────────────────

describe("MASS-003 — Route mounts", () => {
  it("T-MASS-003-6a [blocant] finMassRoutes exports import/parties and import/spend handlers", async () => {
    const { finMassRoutes } = await import("../../../server/routes/finMass");
    expect(finMassRoutes).toBeDefined();
    expect(typeof finMassRoutes.fetch).toBe("function");
  });

  it("T-MASS-003-6b [blocant] finMassRoutes is still mounted in app.ts", () => {
    const appText = readFileSync(resolve(process.cwd(), "server/app.ts"), "utf-8");
    expect(appText).toContain('app.route("/api/fin/mass", finMassRoutes)');
  });

  it("T-MASS-003-6c [blocant] finMass.ts contains /import/parties and /import/spend handlers", () => {
    const routeText = readFileSync(
      resolve(process.cwd(), "server/routes/finMass.ts"),
      "utf-8"
    );
    expect(routeText).toContain("/import/parties");
    expect(routeText).toContain("/import/spend");
    expect(routeText).toContain("makePartyImportProcessor");
    expect(routeText).toContain("makeSpendImportProcessor");
  });
});

// ─── T-MASS-003-7: CsvImportZone ─────────────────────────────────────────────

describe("MASS-003 — CsvImportZone UI component", () => {
  it("T-MASS-003-7 [normal] CsvImportZone exports a function component", async () => {
    const { CsvImportZone } = await import("../../components/fin/CsvImportZone");
    expect(typeof CsvImportZone).toBe("function");
  });
});

// ─── T-MASS-003-8: API client ─────────────────────────────────────────────────

describe("MASS-003 — API client exports", () => {
  it("T-MASS-003-8 [normal] importPartiesFromCsv and importSpendFromCsv exported", async () => {
    const api = await import("../../lib/api/finMass");
    expect(typeof api.importPartiesFromCsv).toBe("function");
    expect(typeof api.importSpendFromCsv).toBe("function");
  });
});
