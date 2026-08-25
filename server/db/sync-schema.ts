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
    // PAR-MOD-03/04/16 (migration 0136): the payer hierarchy + scope + platform-admin tables are
    // queried on EVERY /api/par request (requireModuleEntitlement reads platform_admins +
    // par_payer_modules, with no try/catch). Prod does NOT auto-apply drizzle migrations
    // (prod-migration-tracking-desynced), so without this heal the whole PAR module 500s with
    // "relation par_payer_modules does not exist" until 0136 lands. par_payers MUST be created
    // first (the others FK to it). Idempotent CREATE … IF NOT EXISTS, one statement per call.
    `CREATE TABLE IF NOT EXISTS "par_payers" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "name" varchar(300) NOT NULL,
      "legal_name" varchar(300),
      "idno" varchar(32),
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "par_payers_tenant_idx" ON "par_payers" ("tenant_id")`,
    `CREATE TABLE IF NOT EXISTS "platform_admins" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "platform_admins_user_uniq" UNIQUE("user_id")
    )`,
    `CREATE TABLE IF NOT EXISTS "par_payer_modules" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "payer_id" uuid NOT NULL REFERENCES "par_payers"("id") ON DELETE cascade,
      "module_key" varchar(50) NOT NULL,
      "enabled" boolean NOT NULL DEFAULT false,
      "updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "par_payer_modules_payer_key_uniq" UNIQUE("payer_id", "module_key")
    )`,
    `CREATE INDEX IF NOT EXISTS "par_payer_modules_payer_idx" ON "par_payer_modules" ("payer_id")`,
    `CREATE TABLE IF NOT EXISTS "par_payer_members" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "payer_id" uuid NOT NULL REFERENCES "par_payers"("id") ON DELETE cascade,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "par_payer_members_payer_user_uniq" UNIQUE("payer_id", "user_id")
    )`,
    `CREATE INDEX IF NOT EXISTS "par_payer_members_payer_idx" ON "par_payer_members" ("payer_id")`,
    `CREATE INDEX IF NOT EXISTS "par_payer_members_user_idx" ON "par_payer_members" ("tenant_id", "user_id")`,
    `CREATE TABLE IF NOT EXISTS "par_member_profiles" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "department_id" uuid REFERENCES "par_departments"("id") ON DELETE set null,
      "job_title" varchar(300),
      "staff_code" varchar(100),
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "par_member_profiles_tenant_user_uniq" UNIQUE("tenant_id", "user_id")
    )`,
    `CREATE INDEX IF NOT EXISTS "par_member_profiles_tenant_idx" ON "par_member_profiles" ("tenant_id")`,
    `CREATE TABLE IF NOT EXISTS "par_project_members" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "project_id" uuid NOT NULL REFERENCES "par_projects"("id") ON DELETE cascade,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      CONSTRAINT "par_project_members_project_user_uniq" UNIQUE("project_id", "user_id")
    )`,
    `CREATE INDEX IF NOT EXISTS "par_project_members_project_idx" ON "par_project_members" ("project_id")`,
    `CREATE INDEX IF NOT EXISTS "par_project_members_user_idx" ON "par_project_members" ("tenant_id", "user_id")`,
    // VM1-12: finance uploads the signed payment order; code writes kind='payment_order'.
    // Prod migrations lag deploys (see docs/solutions prod-migration-desync), so heal the enum here too.
    `ALTER TYPE "public"."par_attachment_kind" ADD VALUE IF NOT EXISTS 'payment_order'`,
    // Migrarea 0140: anexele standard din formularul PAR. Fără heal, un upload cu unul din
    // tipurile noi 500-ează pe prod ("invalid input value for enum") până aterizează migrarea.
    `ALTER TYPE "public"."par_attachment_kind" ADD VALUE IF NOT EXISTS 'participants_list'`,
    `ALTER TYPE "public"."par_attachment_kind" ADD VALUE IF NOT EXISTS 'narrative_report'`,
    `ALTER TYPE "public"."par_attachment_kind" ADD VALUE IF NOT EXISTS 'deliverables'`,
    // PLATFORM-001 (migration 0138): Consola Platformă. `login_events` e scris pe FIECARE
    // login (business + learn + Google), iar `tenant_modules` e citit la fiecare hidratare a
    // shell-ului. Prod nu aplică fiabil migrările, deci fără heal login-ul ar loga o eroare la
    // fiecare încercare, iar consola ar 500. Idempotent, o instrucțiune per apel.
    `CREATE TABLE IF NOT EXISTS "platform_module_defaults" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "module_key" varchar(50) NOT NULL,
      "enabled" boolean NOT NULL DEFAULT true,
      "updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "platform_module_defaults_key_uniq" ON "platform_module_defaults" ("module_key")`,
    `INSERT INTO "platform_module_defaults" ("module_key", "enabled")
      SELECT v.k, true FROM (VALUES ('findesk'), ('par'), ('itpark'), ('docmerge')) AS v(k)
      ON CONFLICT ("module_key") DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS "tenant_modules" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "module_key" varchar(50) NOT NULL,
      "enabled" boolean NOT NULL DEFAULT true,
      "updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "tenant_modules_tenant_idx" ON "tenant_modules" ("tenant_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "tenant_modules_tenant_key_uniq" ON "tenant_modules" ("tenant_id","module_key")`,
    // Backfill explicit pentru workspace-urile existente — vezi comentariul din 0138.
    `INSERT INTO "tenant_modules" ("tenant_id", "module_key", "enabled")
      SELECT t."id", v.k, true FROM "tenants" t
      CROSS JOIN (VALUES ('findesk'), ('par'), ('itpark'), ('docmerge')) AS v(k)
      ON CONFLICT ("tenant_id", "module_key") DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS "login_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
      "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE set null,
      "email" varchar(255) NOT NULL,
      "app" varchar(20) NOT NULL DEFAULT 'business',
      "method" varchar(20) NOT NULL DEFAULT 'password',
      "success" boolean NOT NULL,
      "failure_reason" varchar(60),
      "ip_address" varchar(64),
      "user_agent" varchar(512),
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "login_events_created_idx" ON "login_events" ("created_at")`,
    `CREATE INDEX IF NOT EXISTS "login_events_tenant_idx" ON "login_events" ("tenant_id","created_at")`,
    `CREATE INDEX IF NOT EXISTS "login_events_user_idx" ON "login_events" ("user_id","created_at")`,
    `CREATE INDEX IF NOT EXISTS "login_events_email_idx" ON "login_events" ("email")`,
    `CREATE TABLE IF NOT EXISTS "platform_audit_log" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "actor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
      "actor_email" varchar(255),
      "action" varchar(60) NOT NULL,
      "target_type" varchar(40),
      "target_id" varchar(100),
      "target_label" varchar(300),
      "meta" jsonb,
      "ip_address" varchar(64),
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "platform_audit_log_created_idx" ON "platform_audit_log" ("created_at")`,
    `CREATE INDEX IF NOT EXISTS "platform_audit_log_target_idx" ON "platform_audit_log" ("target_type","target_id")`,
    `CREATE TABLE IF NOT EXISTS "tenant_notes" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "author_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
      "author_email" varchar(255),
      "body" text NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "tenant_notes_tenant_idx" ON "tenant_notes" ("tenant_id","created_at")`,
    // PLATFORM-002 (migration 0139): telemetria de erori. Se scrie din `app.onError`, adică
    // exact în momentul în care ceva deja merge prost — dacă tabela lipsește, nu are voie să
    // adauge o a doua eroare peste prima. De aceea e healed aici, nu doar migrat.
    `CREATE TABLE IF NOT EXISTS "error_groups" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "fingerprint" varchar(64) NOT NULL,
      "kind" varchar(30) NOT NULL,
      "title" varchar(300) NOT NULL,
      "location" varchar(300),
      "occurrences" integer NOT NULL DEFAULT 1,
      "affected_tenants" integer NOT NULL DEFAULT 0,
      "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
      "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
      "status" varchar(20) NOT NULL DEFAULT 'open',
      "resolved_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
      "resolved_at" timestamp with time zone,
      "alerted_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "error_groups_fingerprint_uniq" ON "error_groups" ("fingerprint")`,
    `CREATE INDEX IF NOT EXISTS "error_groups_last_seen_idx" ON "error_groups" ("last_seen_at")`,
    `CREATE INDEX IF NOT EXISTS "error_groups_status_idx" ON "error_groups" ("status","last_seen_at")`,
    `CREATE TABLE IF NOT EXISTS "error_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "group_id" uuid REFERENCES "error_groups"("id") ON DELETE cascade,
      "fingerprint" varchar(64) NOT NULL,
      "kind" varchar(30) NOT NULL,
      "message" text NOT NULL,
      "stack" text,
      "location" varchar(300),
      "method" varchar(10),
      "status_code" integer,
      "url" varchar(1000),
      "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE set null,
      "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
      "user_email" varchar(255),
      "user_agent" varchar(512),
      "ip_address" varchar(64),
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "error_events_group_idx" ON "error_events" ("group_id","created_at")`,
    `CREATE INDEX IF NOT EXISTS "error_events_created_idx" ON "error_events" ("created_at")`,
    `CREATE INDEX IF NOT EXISTS "error_events_tenant_idx" ON "error_events" ("tenant_id","created_at")`,
  ];
  for (const stmt of ENSURE_STATEMENTS) {
    try {
      await sql.unsafe(stmt);
    } catch (e) {
      console.warn(`[sync-schema] ensure-table stmt skipped:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`[sync-schema] ensured par_project_approvers`);

  const indexesAdded = await ensureIndexes(sql);

  console.log(
    `[sync-schema] done — ${added} missing column(s), ${indexesAdded} missing index(es) added.`
  );
  await sql.end();
}

/**
 * PERF-006 — creează indecșii declarați în schema drizzle care lipsesc din baza de date.
 *
 * De ce e necesar: schema declară ~294 de indecși, dar migrările NU se aplică fiabil pe producție
 * (vezi docs/solutions/database-issues + memoria „prod-migration-tracking-desynced"). Restul lui
 * sync-schema vindecă doar COLOANE, deci un index declarat într-o migrare care n-a rulat niciodată
 * pur și simplu nu există în producție.
 *
 * Consecința e invizibilă până devine gravă: interogările funcționează, doar fac seq scan. Cel mai
 * costisitor exemplu e `sessions_token_idx` — căutarea după token se face la FIECARE cerere
 * autentificată; fără index, costul crește liniar cu numărul total de sesiuni din sistem.
 *
 * `CREATE INDEX IF NOT EXISTS` e idempotent și non-distructiv, la fel ca `ADD COLUMN IF NOT EXISTS`
 * de mai sus. Fără `CONCURRENTLY`: la deploy, tabelele sunt mici sau indexul există deja, iar
 * `CONCURRENTLY` nu poate rula într-o tranzacție și complică recuperarea din eșec.
 */
async function ensureIndexes(sql: ReturnType<typeof postgres>): Promise<number> {
  const tables = Object.values(schema).filter(
    (v: unknown) =>
      !!v && typeof v === "object" && (v as Record<symbol, unknown>)[Symbol.for("drizzle:IsDrizzleTable")] === true
  );

  // Ce indecși există deja — o singură interogare, nu una per index.
  const existing = new Set(
    (
      await sql<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
      `
    ).map((r) => r.indexname)
  );

  let created = 0;
  for (const table of tables) {
    const tableName = getTableName(table as never);
    // Configurația de indecși stă pe simbolul intern al drizzle (`ExtraConfigBuilder`).
    const extra = (table as Record<symbol, unknown>)[Symbol.for("drizzle:ExtraConfigBuilder")] as
      | ((self: unknown) => Record<string, unknown>)
      | undefined;
    if (typeof extra !== "function") continue;

    let config: Record<string, unknown>;
    try {
      config = extra((table as Record<symbol, unknown>)[Symbol.for("drizzle:ExtraConfigColumns")] ?? table);
    } catch {
      continue; // o configurație pe care n-o putem evalua nu are voie să oprească deploy-ul
    }

    for (const builder of Object.values(config ?? {})) {
      const cfg = (builder as { config?: { name?: string; columns?: unknown[]; unique?: boolean } })?.config;
      if (!cfg?.name || !Array.isArray(cfg.columns) || cfg.columns.length === 0) continue;
      if (existing.has(cfg.name)) continue;

      const cols = cfg.columns
        .map((col) => (col as { name?: string })?.name)
        .filter((n): n is string => typeof n === "string");
      if (cols.length !== cfg.columns.length) continue; // expresie, nu simple coloane — o sărim

      const unique = cfg.unique ? "UNIQUE " : "";
      const stmt = `CREATE ${unique}INDEX IF NOT EXISTS "${cfg.name}" ON "${tableName}" (${cols
        .map((cn) => `"${cn}"`)
        .join(", ")})`;
      try {
        await sql.unsafe(stmt);
        console.log(`[sync-schema] +index ${cfg.name} on ${tableName}(${cols.join(", ")})`);
        created++;
      } catch (e) {
        // Un index care nu se poate crea (coloană lipsă, duplicate pe unic) e demn de semnalat,
        // dar nu de oprit deploy-ul — aplicația funcționează și fără el, doar mai lent.
        console.warn(`[sync-schema] index ${cfg.name} skipped:`, e instanceof Error ? e.message : e);
      }
    }
  }
  return created;
}

main().catch((err) => {
  // Never fail the deploy on a sync error — log and continue (migrations already ran).
  console.error("[sync-schema] error (non-fatal):", err instanceof Error ? err.message : err);
  process.exit(0);
});
