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

  // Self-heal NEW tables whose migration may lag the code deploy (the #1 client-facing 500: new code
  // queries a table the prod DB doesn't have yet — e.g. "relation par_project_approvers does not
  // exist"). Idempotent CREATE … IF NOT EXISTS, one statement per call (multi-statement unsafe() can
  // trip the driver). A real migration still ships the table; this is the safety net for deploy lag.
  // STMT-003: ensure linked_fin_invoice_id column exists on fin_capture_lines.
  // Migration 0126 adds it; this heal covers any deploy-lag window.
  const ENSURE_COLUMN_STMTS: string[] = [
    `ALTER TABLE fin_capture_lines ADD COLUMN IF NOT EXISTS linked_fin_invoice_id uuid REFERENCES fin_invoices(id) ON DELETE SET NULL`,
    `CREATE INDEX IF NOT EXISTS fin_cap_lines_linked_inv_idx ON fin_capture_lines(linked_fin_invoice_id)`,
    // AUTOBILL: on prod the auto_billing column was created by THIS self-heal (nullable, no
    // default) because drizzle's migration tracking is desynced and 0132 never applied. NULL
    // behaves like false everywhere, but enforce the schema contract: backfill + default +
    // NOT NULL. Idempotent; migration 0133 does the same for fresh DBs.
    `UPDATE fin_agreements SET auto_billing = false WHERE auto_billing IS NULL`,
    `ALTER TABLE fin_agreements ALTER COLUMN auto_billing SET DEFAULT false`,
    `ALTER TABLE fin_agreements ALTER COLUMN auto_billing SET NOT NULL`,
  ];
  for (const stmt of ENSURE_COLUMN_STMTS) {
    try {
      await sql.unsafe(stmt);
    } catch (e) {
      console.warn(`[sync-schema] ensure-column stmt skipped:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`[sync-schema] ensured linked_fin_invoice_id on fin_capture_lines`);

  const ENSURE_STATEMENTS: string[] = [
    `CREATE TABLE IF NOT EXISTS "par_project_approvers" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "project_id" uuid NOT NULL REFERENCES "par_projects"("id") ON DELETE cascade,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "par_project_approvers_project_idx" ON "par_project_approvers" ("project_id")`,
    `CREATE INDEX IF NOT EXISTS "par_project_approvers_tenant_idx" ON "par_project_approvers" ("tenant_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "par_project_approvers_project_user_uniq" ON "par_project_approvers" ("project_id","user_id")`,
  ];
  for (const stmt of ENSURE_STATEMENTS) {
    try {
      await sql.unsafe(stmt);
    } catch (e) {
      console.warn(`[sync-schema] ensure-table stmt skipped:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`[sync-schema] ensured par_project_approvers`);

  console.log(`[sync-schema] done — ${added} missing column(s) added.`);
  await sql.end();
}

main().catch((err) => {
  // Never fail the deploy on a sync error — log and continue (migrations already ran).
  console.error("[sync-schema] error (non-fatal):", err instanceof Error ? err.message : err);
  process.exit(0);
});
