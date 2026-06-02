/**
 * @vitest-environment node
 *
 * PAY-008 — Accounting export (SAGA/1C CSV)
 *
 * T-PAY-008-1 [blocant] SAGA CSV: header has correct columns
 * T-PAY-008-2 [blocant] Refund row appears as NC type with negative amount
 * T-PAY-008-3 [blocant] accounting_mappings table exists and mapping can be inserted
 * T-PAY-008-4 [normal]  Empty month → CSV with only header (no error)
 * T-PAY-008-5 [normal]  1C format → tab-separated, no BOM, correct columns
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../../../server/db/schema/index";
import {
  generateSagaCsv,
  generate1cCsv,
  escapeCsvCell,
  applyDescriptionTemplate,
  type AccountingRow,
} from "../../../server/lib/accountingExport";

let pglite: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;

const TENANT_ID = "e0000000-0000-0000-0000-000000000001";

beforeAll(async () => {
  pglite = new PGlite();
  db = drizzle({ client: pglite, schema });

  const drizzleDir = path.resolve(__dirname, "../../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };

  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const file = path.join(drizzleDir, `${entry.tag}.sql`);
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    const stmts = raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const stmt of stmts) {
      await pglite.exec(stmt);
    }
  }

  await db.insert(schema.tenants).values({
    id: TENANT_ID,
    name: "Accounting Test School",
    slug: "accounting-test-pay008",
    plan: "pro",
  });
}, 60_000);

afterAll(async () => {
  await pglite.close();
});

// ─── Schema test ──────────────────────────────────────────────────────────────

describe("PAY-008 — accounting_mappings schema", () => {
  it("T-PAY-008-3 [blocant] accounting_mappings table exists and mapping can be inserted", async () => {
    const [mapping] = await db
      .insert(schema.accountingMappings)
      .values({
        tenantId: TENANT_ID,
        transactionType: "payment",
        accountCode: "704",
        descriptionTemplate: "Taxă curs — {description}",
      })
      .returning();

    expect(mapping).toBeDefined();
    expect(mapping.id).toBeTruthy();
    expect(mapping.transactionType).toBe("payment");
    expect(mapping.accountCode).toBe("704");

    // Also test refund and payout mappings
    const [refundMap] = await db
      .insert(schema.accountingMappings)
      .values({
        tenantId: TENANT_ID,
        transactionType: "refund",
        accountCode: "704",
        descriptionTemplate: "Rambursare — {description}",
      })
      .returning();
    expect(refundMap.transactionType).toBe("refund");

    const rows = await db
      .select()
      .from(schema.accountingMappings)
      .where(eq(schema.accountingMappings.tenantId, TENANT_ID));
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── CSV generation tests ────────────────────────────────────────────────────

describe("PAY-008 — generateSagaCsv", () => {
  const paymentRow: AccountingRow = {
    date: "2026-06-10",
    type: "PL",
    accountCode: "704",
    description: "Taxă curs engleza",
    amountCents: 120000,
    currency: "RON",
    documentNumber: "PAY001",
    partner: "Maria Ionescu",
  };

  const refundRow: AccountingRow = {
    date: "2026-06-15",
    type: "NC",
    accountCode: "704",
    description: "Rambursare — elev plecat",
    amountCents: -40000, // negative for NC
    currency: "RON",
    documentNumber: "REF001",
    partner: "Maria Ionescu",
  };

  it("T-PAY-008-1 [blocant] SAGA CSV header has correct columns", () => {
    const csv = generateSagaCsv([]);
    const lines = csv.split("\r\n");
    // Remove BOM
    const header = lines[0].replace(/^﻿/, "");
    expect(header).toBe("data,tip,articol_contabil,descriere,suma,moneda,nr_document,partener,tva");
  });

  it("T-PAY-008-1b [blocant] SAGA CSV starts with UTF-8 BOM", () => {
    const csv = generateSagaCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it("T-PAY-008-2 [blocant] Refund row appears as NC type with negative amount", () => {
    const csv = generateSagaCsv([paymentRow, refundRow]);
    const lines = csv.split("\r\n").slice(1); // skip header
    const ncLine = lines.find((l) => l.includes("NC"));
    expect(ncLine).toBeDefined();
    expect(ncLine).toContain("NC");
    expect(ncLine).toContain("-400.00"); // -40000 cents → -400.00
  });

  it("T-PAY-008-1c [blocant] Payment row appears as PL type with positive amount", () => {
    const csv = generateSagaCsv([paymentRow]);
    const lines = csv.split("\r\n").slice(1);
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("PL");
    expect(lines[0]).toContain("1200.00");
  });

  it("T-PAY-008-4 [normal] Empty rows → CSV with only header (no error)", () => {
    const csv = generateSagaCsv([]);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1); // only header
  });
});

describe("PAY-008 — generate1cCsv", () => {
  const paymentRow: AccountingRow = {
    date: "2026-06-10",
    type: "PL",
    accountCode: "704",
    description: "Course fee",
    amountCents: 120000,
    currency: "RON",
    documentNumber: "PAY001",
    partner: "Maria Ionescu",
  };

  it("T-PAY-008-5 [normal] 1C format is tab-separated, no BOM", () => {
    const csv = generate1cCsv([paymentRow]);
    // No BOM
    expect(csv.charCodeAt(0)).not.toBe(0xFEFF);
    // Tab-separated
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("\t");
    expect(lines[0]).toBe("Дата\tДокумент\tКонтрагент\tСумма\tВалюта\tПримечание");
    // Data row
    expect(lines[1]).toContain("2026-06-10");
    expect(lines[1]).toContain("Maria Ionescu");
    expect(lines[1]).toContain("1200.00");
  });

  it("T-PAY-008-5b [normal] 1C empty rows → only header", () => {
    const csv = generate1cCsv([]);
    const lines = csv.split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(1);
  });
});

// ─── Helper tests ─────────────────────────────────────────────────────────────

describe("PAY-008 — CSV helpers", () => {
  it("escapeCsvCell: wraps in quotes when contains comma", () => {
    expect(escapeCsvCell("hello,world")).toBe('"hello,world"');
  });

  it("escapeCsvCell: escapes double quotes", () => {
    expect(escapeCsvCell('he said "hi"')).toBe('"he said ""hi"""');
  });

  it("escapeCsvCell: plain value unchanged", () => {
    expect(escapeCsvCell("plain")).toBe("plain");
  });

  it("applyDescriptionTemplate: substitutes placeholders", () => {
    const result = applyDescriptionTemplate("Taxă curs — {description} / {partner}", {
      description: "English B2",
      partner: "Maria Ionescu",
    });
    expect(result).toBe("Taxă curs — English B2 / Maria Ionescu");
  });

  it("applyDescriptionTemplate: missing placeholder → empty string", () => {
    const result = applyDescriptionTemplate("{partner}", {});
    expect(result).toBe("");
  });
});
