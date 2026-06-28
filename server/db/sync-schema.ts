import "dotenv/config";
import postgres from "postgres";
import { getTableColumns, getTableName } from "drizzle-orm";
import * as schema from "./schema/index";
import { resolveDatabaseUrl } from "./env";

/**
 * Self-healing schema sync — runs at deploy AFTER migrations (see scripts/vercel-migrate.mjs).
 *
 * Why this exists: the drizzle ORM schema (server/db/schema/*) is the source of truth the
 * code queries against, but the committed migrations have repeatedly drifted from it — the
 * 38-PR merge left columns/tables in the schema that NO migration ever created (meta_form_id,
 * meta_ad_id, group_enrollments.status, the whole webhook_events table, …). When code queries
 * a column the DB lacks, EVERY request to that route 500s in prod ("column X does not exist").
 *
 * This step closes the gap idempotently and NON-DESTRUCTIVELY: it introspects the live DB,
 * compares against the schema, and only ever runs `ADD COLUMN IF NOT EXISTS`. It never drops
 * or alters existing columns, so it can't lose data. Missing whole tables are logged loudly
 * (those still need a real migration) but don't fail the build.
 *
 * Postgres only. On PGlite/local (no resolved URL) it no-ops.
 */
async function main() {
  const url = resolveDatabaseUrl(true);
  if (!url) {
    console.log("[sync-schema] No Postgres URL — skipping (local/PGlite).");
    return;
  }
  const sql = postgres(url, { max: 1 });

  const tables = Object.values(schema).filter(
    (v: unknown) =>
      !!v && typeof v === "object" && (v as Record<symbol, unknown>)[Symbol.for("drizzle:IsDrizzleTable")] === true
  );

  let added = 0;
  const missingTables: string[] = [];
  for (const table of tables) {
    const tableName = getTableName(table as never);
    const cols = getTableColumns(table as never);
    const actual = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
    `;
    if (actual.length === 0) {
      missingTables.push(tableName);
      continue;
    }
    const actualSet = new Set(actual.map((r) => r.column_name));
    for (const col of Object.values(cols)) {
      const dbName = (col as { name: string }).name;
      if (!actualSet.has(dbName)) {
        const sqlType = (col as { getSQLType: () => string }).getSQLType();
        try {
          await sql.unsafe(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${dbName}" ${sqlType}`);
          console.log(`[sync-schema] +${tableName}.${dbName} (${sqlType})`);
          added++;
        } catch (e) {
          console.error(`[sync-schema] FAILED ${tableName}.${dbName}:`, e instanceof Error ? e.message : e);
        }
      }
    }
  }

  if (missingTables.length > 0) {
    console.warn(`[sync-schema] ⚠ tables in schema but NOT in DB (need a real migration): ${missingTables.join(", ")}`);
  }

  // Belt-and-suspenders type fix (migration 0122): these columns hold base64 data URLs (megabytes)
  // and were once varchar(2000) → real file uploads 500'd with "value too long for type character
  // varying(2000)". If the migration didn't apply (tracking desync), heal it here. Idempotent:
  // varchar→text is a no-op metadata change once it's already text.
  const TEXT_WIDEN: Array<[string, string]> = [
    ["par_attachments", "file_url"],
    ["par_payments", "proof_url"],
  ];
  for (const [table, col] of TEXT_WIDEN) {
    try {
      await sql.unsafe(`ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE text`);
      console.log(`[sync-schema] ~${table}.${col} → text`);
    } catch (e) {
      // table/column may not exist yet on a given DB — non-fatal.
      console.warn(`[sync-schema] widen ${table}.${col} skipped:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`[sync-schema] done — ${added} missing column(s) added.`);
  await sql.end();
}

main().catch((err) => {
  // Never fail the deploy on a sync error — log and continue (migrations already ran).
  console.error("[sync-schema] error (non-fatal):", err instanceof Error ? err.message : err);
  process.exit(0);
});
