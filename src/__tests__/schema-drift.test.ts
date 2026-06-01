/**
 * @vitest-environment node
 *
 * Schema-drift gate — catches the #1 prod-breaker class.
 *
 * The bug we keep hitting: code ships expecting a table/column (e.g. the `invoices`
 * table, `students.debt_cents`) but the migration that creates it never ran on the
 * DB → every query 500s for the paying client. Vercel auto-deploys code but not
 * migrations, so code and schema can drift apart.
 *
 * This test applies ALL committed migrations to a fresh PGlite DB, then asserts that
 * every table + every column the drizzle schema declares actually EXISTS in the
 * migrated database. If a schema change shipped without a matching migration, this
 * fails here (in CI) instead of 500-ing in prod.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../../server/db/schema/index";

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
  const client = new PGlite();
  db = drizzle({ client, schema });
  // Apply every committed migration .sql from scratch, in journal order.
  // We read + execute the files directly (instead of drizzle's migrator) because the
  // migrator's file-loading doesn't work under vitest's jsdom env. This is also a more
  // faithful test: it runs exactly the SQL that ships to prod, in the same order.
  const drizzleDir = path.resolve(import.meta.dirname ?? __dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const file = path.join(drizzleDir, `${entry.tag}.sql`);
    const raw = fs.readFileSync(file, "utf8");
    // drizzle separates statements with this breakpoint marker.
    const statements = raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await client.exec(stmt);
    }
  }
}, 60_000);

// Enumerate every pgTable the code declares.
const tables = Object.values(schema).filter(
  (v) => !!v && typeof v === "object" && Symbol.for("drizzle:IsDrizzleTable") in v
) as Parameters<typeof getTableConfig>[0][];

describe("schema-drift gate — migrations cover the code's schema", () => {
  it("declares at least the core tables", () => {
    // Sanity: we actually enumerated tables (not an empty pass).
    expect(tables.length).toBeGreaterThan(10);
  });

  it("every table declared in code exists in the migrated DB", async () => {
    const missing: string[] = [];
    for (const t of tables) {
      const { name } = getTableConfig(t);
      const res = await db.execute(
        sql.raw(`select to_regclass('public."${name}"') as t`)
      );
      const rows = Array.isArray(res) ? res : (res as { rows: unknown[] }).rows;
      const exists = (rows[0] as { t: string | null } | undefined)?.t;
      if (!exists) missing.push(name);
    }
    expect(missing, `Tables in code but missing from migrations: ${missing.join(", ")}`).toEqual([]);
  });

  it("every column declared in code exists in the migrated DB", async () => {
    const missing: string[] = [];
    for (const t of tables) {
      const { name, columns } = getTableConfig(t);
      const res = await db.execute(
        sql.raw(
          `select column_name from information_schema.columns where table_name = '${name}'`
        )
      );
      const rows = Array.isArray(res) ? res : (res as { rows: unknown[] }).rows;
      const dbCols = new Set(rows.map((r) => (r as { column_name: string }).column_name));
      for (const col of columns) {
        if (!dbCols.has(col.name)) missing.push(`${name}.${col.name}`);
      }
    }
    expect(
      missing,
      `Columns in code but missing from migrations (would 500 in prod): ${missing.join(", ")}`
    ).toEqual([]);
  });
});
