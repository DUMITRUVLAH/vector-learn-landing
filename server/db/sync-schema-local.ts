import "dotenv/config";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { db, closeDb } from "./client";
import * as schema from "./schema/index";

/**
 * Local PGlite counterpart of sync-schema.ts (which is Postgres-only and no-ops on PGlite).
 *
 * Why this exists: the committed migrations have drifted behind the drizzle schema, so a fresh
 * `db:reset` leaves the local PGlite DB missing columns the code expects (e.g. tenants.app_kind,
 * par_vendors.kind). On prod, sync-schema.ts heals this after migrations; locally nothing did, so
 * `db:reset && db:seed` failed with "column X does not exist" — violating CLAUDE.md §3.5.1.
 *
 * This closes the gap idempotently and NON-DESTRUCTIVELY: introspect the live PGlite DB, compare
 * against the schema, and only ever `ADD COLUMN IF NOT EXISTS`. Missing whole tables are logged
 * loudly (those still need a real migration) but never fail the run.
 *
 * PGlite/local only — wired into `db:reset` after `db:migrate`.
 */
async function rows(res: unknown): Promise<Array<Record<string, unknown>>> {
  if (Array.isArray(res)) return res as Array<Record<string, unknown>>;
  const r = res as { rows?: Array<Record<string, unknown>> };
  return r.rows ?? [];
}

async function main() {
  const tables = Object.values(schema).filter(
    (v: unknown) =>
      !!v && typeof v === "object" && (v as Record<symbol, unknown>)[Symbol.for("drizzle:IsDrizzleTable")] === true
  );

  let added = 0;
  const missingTables: string[] = [];
  for (const table of tables) {
    const tableName = getTableName(table as never);
    const cols = getTableColumns(table as never);
    const actual = await rows(
      await db.execute(sql`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${tableName}
      `)
    );
    if (actual.length === 0) {
      missingTables.push(tableName);
      continue;
    }
    const actualSet = new Set(actual.map((r) => String(r.column_name)));
    for (const col of Object.values(cols)) {
      const dbName = (col as { name: string }).name;
      if (!actualSet.has(dbName)) {
        const sqlType = (col as { getSQLType: () => string }).getSQLType();
        try {
          await db.execute(sql.raw(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${dbName}" ${sqlType}`));
          console.log(`[sync-schema-local] +${tableName}.${dbName} (${sqlType})`);
          added++;
        } catch (e) {
          console.error(`[sync-schema-local] FAILED ${tableName}.${dbName}:`, e instanceof Error ? e.message : e);
        }
      }
    }
  }

  if (missingTables.length > 0) {
    console.warn(
      `[sync-schema-local] ⚠ ${missingTables.length} table(s) in schema but NOT in DB (need a real migration): ${missingTables.join(", ")}`
    );
  }
  console.log(`[sync-schema-local] done — ${added} missing column(s) added.`);
  await closeDb();
}

main().catch((err) => {
  console.error("[sync-schema-local] error (non-fatal):", err instanceof Error ? err.message : err);
  process.exit(0);
});
