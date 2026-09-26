import "dotenv/config";
import postgres from "postgres";
import { getTableColumns, getTableName } from "drizzle-orm";
import * as schema from "./schema/index";
import { resolveDatabaseUrl } from "./env";
import { literalDefault } from "./literalDefault";
import { DOCGEN_ENSURE_STATEMENTS } from "./ensure/docgen";
import { PAR_VENDOR_PROFILE_ENSURE_STATEMENTS } from "./ensure/parVendorProfile";
import { PAR_DRIVE_ENSURE_STATEMENTS } from "./ensure/parDriveSync";
import { CRM_PARITY_ENSURE_STATEMENTS } from "./ensure/crmParity";
import { PONTAJ_ENSURE_STATEMENTS } from "./ensure/pontaj";

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
    const actual = await sql<{ column_name: string; column_default: string | null }[]>`
      SELECT column_name, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${tableName}
    `;
    if (actual.length === 0) {
      missingTables.push(tableName);
      continue;
    }
    const actualSet = new Set(actual.map((r) => r.column_name));
    const withoutDefault = new Set(actual.filter((r) => r.column_default == null).map((r) => r.column_name));
    for (const col of Object.values(cols)) {
      const dbName = (col as { name: string }).name;
      const literal = literalDefault(col);
      if (actualSet.has(dbName) && literal && withoutDefault.has(dbName)) {
        // O coloană adăugată mai demult de acest heal, fără default: Drizzle lasă default-ul pe
        // seama bazei, deci fiecare INSERT care nu o numește scrie NULL (vezi `literalDefault`).
        try {
          await sql.unsafe(`ALTER TABLE "${tableName}" ALTER COLUMN "${dbName}" SET DEFAULT ${literal}`);
          console.log(`[sync-schema] ~${tableName}.${dbName} DEFAULT ${literal}`);
        } catch (e) {
          console.error(`[sync-schema] FAILED default ${tableName}.${dbName}:`, e instanceof Error ? e.message : e);
        }
      }
      if (!actualSet.has(dbName)) {
        const sqlType = (col as { getSQLType: () => string }).getSQLType();
        try {
          await sql.unsafe(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "${dbName}" ${sqlType}${literal ? ` DEFAULT ${literal}` : ""}`);
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
  // Migrarea 0140 lărgește codul fiscal al beneficiarului de la varchar(13) (formatul MD) la
  // varchar(50), ca plățile internaționale să poată păstra un cod estonian/german. Migrările nu
  // se aplică fiabil pe prod (tracking desincronizat), deci vindecăm și aici — idempotent.
  const VARCHAR_WIDEN: Array<[string, string, number]> = [
    ["par_vendors", "idnp", 50],
    ["par_requests", "payee_idnp", 50],
    ["par_purchase_orders", "vendor_idnp", 50],
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
  for (const [table, col, len] of VARCHAR_WIDEN) {
    try {
      await sql.unsafe(`ALTER TABLE "${table}" ALTER COLUMN "${col}" TYPE varchar(${len})`);
      console.log(`[sync-schema] ~${table}.${col} → varchar(${len})`);
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
    // Migrarea 0158 mută conținutul atașamentelor în Storage, deci rândurile noi se scriu cu
    // `file_url = NULL`. Heal-ul generic de mai sus adaugă doar coloane LIPSĂ — nu relaxează o
    // constrângere existentă. Dacă 0158 nu prinde pe prod (tracking desincronizat), fiecare
    // upload ar pica pe not-null, adică exact clasa de 500 care ajunge la clientul plătitor.
    `ALTER TABLE par_attachments ALTER COLUMN file_url DROP NOT NULL`,
    // Steagul care spune dacă documentul de portal e deja obiect în Storage. Coloana o adaugă
    // heal-ul generic, dar fără default — pe rândurile vechi ar rămâne NULL. NULL se comportă
    // deja ca „nu e în Storage" peste tot, dar contractul din schemă e NOT NULL DEFAULT false.
    `UPDATE fin_client_portal_documents SET in_object_store = false WHERE in_object_store IS NULL`,
    `ALTER TABLE fin_client_portal_documents ALTER COLUMN in_object_store SET DEFAULT false`,
    `ALTER TABLE fin_client_portal_documents ALTER COLUMN in_object_store SET NOT NULL`,
    // `par_vendors.kind`: adăugată aici fără default, deci plata înregistrată și adăugarea din
    // administrare scriau NULL — companiile apăreau „Persoană fizică" (vezi `vendorKind.ts`).
    // Aceeași ordine de dovezi ca `vendorKindFor`: codul fiscal, apoi denumirea.
    `ALTER TABLE par_vendors ALTER COLUMN kind SET DEFAULT 'individual'`,
    `UPDATE par_vendors SET kind = CASE
       WHEN regexp_replace(coalesce(idnp, ''), '\\s', '', 'g') ~ '^1[0-9]{12}$' THEN 'company'
       WHEN regexp_replace(coalesce(idnp, ''), '\\s', '', 'g') ~ '^[02][0-9]{12}$' THEN 'individual'
       WHEN name ~* '(s\\.?r\\.?l|\\ms\\.?a\\.?\\M|\\mao\\M|\\mong\\M|asocia|compan|institu|funda|agen[tț]ia|centrul|sec[tț]ia|[iî]ntreprinderea|\\m[iî]\\.?[is]\\.?\\M)' THEN 'company'
       ELSE 'individual' END
     WHERE kind IS NULL`,
    `ALTER TABLE par_vendors ALTER COLUMN kind SET NOT NULL`,
    // Migrarea 0194: invitațiile CRM trăiesc în `par_invites`, fără rol PAR. Heal-ul generic
    // adaugă `module`/`workspace_role`, dar nu relaxează NOT NULL-ul de pe `par_role` — fără asta,
    // fiecare invitație CRM ar pica la INSERT pe prod. `module` vine din heal fără default, deci
    // rândurile vechi primesc explicit „par".
    `ALTER TABLE par_invites ALTER COLUMN par_role DROP NOT NULL`,
    `UPDATE par_invites SET module = 'par' WHERE module IS NULL`,
    `ALTER TABLE par_invites ALTER COLUMN module SET DEFAULT 'par'`,
    `ALTER TABLE par_invites ALTER COLUMN module SET NOT NULL`,
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
    // VM5-22 (migrarea 0175): echipele PAR. `GET /api/par` citește par_team_members la FIECARE
    // listare, deci fără tabelă lista de cereri 500-ește peste tot, nu doar în ecranul de echipe.
    `CREATE TABLE IF NOT EXISTS "par_teams" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "name" varchar(200) NOT NULL,
      "active" boolean NOT NULL DEFAULT true,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "par_teams_tenant_idx" ON "par_teams" ("tenant_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "par_teams_tenant_name_uniq" ON "par_teams" ("tenant_id","name")`,
    `CREATE TABLE IF NOT EXISTS "par_team_members" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "team_id" uuid NOT NULL REFERENCES "par_teams"("id") ON DELETE cascade,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "par_team_members_team_idx" ON "par_team_members" ("team_id")`,
    `CREATE INDEX IF NOT EXISTS "par_team_members_user_idx" ON "par_team_members" ("tenant_id","user_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "par_team_members_team_user_uniq" ON "par_team_members" ("team_id","user_id")`,
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
    // Pre-aprobatorii de proiect (migrarea 0178). `submitPAR` citește tabela la FIECARE depunere,
    // deci fără ea nu s-ar mai putea trimite nicio cerere de pe un proiect. Helperul tolerează
    // lipsa tabelei, dar plasa asta o creează oricum în fereastra de deploy-lag.
    `CREATE TABLE IF NOT EXISTS "par_project_pre_approvers" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "project_id" uuid NOT NULL REFERENCES "par_projects"("id") ON DELETE cascade,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "par_project_pre_approvers_project_idx" ON "par_project_pre_approvers" ("project_id")`,
    `CREATE INDEX IF NOT EXISTS "par_project_pre_approvers_tenant_idx" ON "par_project_pre_approvers" ("tenant_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "par_project_pre_approvers_project_user_uniq" ON "par_project_pre_approvers" ("project_id","user_id")`,
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
    // PAR-EFP (migrarea 0146): urmărirea e-Facturii primite de la prestator. Ruta
    // /api/par/efactura o interoghează la fiecare deschidere a cererii plătite, iar prod-ul nu
    // aplică fiabil migrările — fără heal, cardul din pagină ar da 500 „relation does not exist".
    `DO $$ BEGIN
      CREATE TYPE "par_einvoice_status" AS ENUM ('not_applicable', 'expected', 'found', 'received_manual');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE TABLE IF NOT EXISTS "par_einvoices" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "par_id" uuid NOT NULL REFERENCES "par_requests"("id") ON DELETE cascade,
      "status" "par_einvoice_status" NOT NULL DEFAULT 'expected',
      "supplier_idno" varchar(50),
      "sfs_seria" varchar(20),
      "sfs_number" varchar(50),
      "sfs_invoice_status" integer,
      "invoice_date" timestamp with time zone,
      "invoice_total_cents" integer,
      "last_scan_at" timestamp with time zone,
      "last_scan_source" varchar(10),
      "last_scan_message" text,
      "reminder_count" integer NOT NULL DEFAULT 0,
      "last_reminder_at" timestamp with time zone,
      "last_reminder_to_email" varchar(255),
      "marked_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
      "marked_note" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "par_einvoices_par_unique" ON "par_einvoices" ("par_id")`,
    `CREATE INDEX IF NOT EXISTS "par_einvoices_tenant_status_idx" ON "par_einvoices" ("tenant_id","status")`,
    `CREATE INDEX IF NOT EXISTS "par_einvoices_par_idx" ON "par_einvoices" ("par_id")`,
    // PAR-EFP (migrarea 0186): copia locală a facturilor din SFS + cursorul de sincronizare.
    // Tabul „Toate e-Facturile" le citește la fiecare deschidere; fără heal, pagina ar da 500
    // „relation par_sfs_invoices does not exist" până când migrarea ajunge pe prod.
    `CREATE TABLE IF NOT EXISTS "par_sfs_invoices" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "seria" varchar(20) NOT NULL,
      "number" varchar(50) NOT NULL,
      "invoice_status" integer NOT NULL DEFAULT 0,
      "supplier_idno" varchar(50),
      "supplier_name" varchar(300),
      "buyer_idno" varchar(50),
      "invoice_date" timestamp with time zone,
      "total_cents" integer,
      "portal_url" text,
      "details_fetched_at" timestamp with time zone,
      "detail_attempts" integer NOT NULL DEFAULT 0,
      "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
      "last_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "par_sfs_invoices_tenant_key_uniq" ON "par_sfs_invoices" ("tenant_id","seria","number")`,
    `CREATE INDEX IF NOT EXISTS "par_sfs_invoices_tenant_date_idx" ON "par_sfs_invoices" ("tenant_id","invoice_date")`,
    `CREATE INDEX IF NOT EXISTS "par_sfs_invoices_tenant_supplier_idx" ON "par_sfs_invoices" ("tenant_id","supplier_idno")`,
    `CREATE INDEX IF NOT EXISTS "par_sfs_invoices_pending_idx" ON "par_sfs_invoices" ("tenant_id","details_fetched_at")`,
    `CREATE TABLE IF NOT EXISTS "par_sfs_sync_state" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "heads_synced_at" timestamp with time zone,
      "archive_cursor_to" timestamp with time zone,
      "archive_done_at" timestamp with time zone,
      "last_batch_at" timestamp with time zone,
      "last_message" text,
      "last_error" text,
      "running_since" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "par_sfs_sync_state_tenant_uniq" ON "par_sfs_sync_state" ("tenant_id")`,
    // Migrarea 0147: moneda liniei de buget. Healul generic de mai sus ar adăuga coloana FĂRĂ
    // default și FĂRĂ NOT NULL, deci rândurile existente ar rămâne cu currency = NULL, iar
    // inserturile care omit câmpul ar scrie NULL. Aici o punem cu tot cu default.
    `ALTER TABLE "par_budget_codes" ADD COLUMN IF NOT EXISTS "currency" varchar(3) DEFAULT 'MDL' NOT NULL`,
    // Migrarea 0148: cache-ul de curs BNM. E o tabelă NOUĂ pe calea unei cereri (pagina de curs
    // valutar din PAR o citește la fiecare deschidere), iar prod-ul primește codul înaintea
    // migrării — fără heal, secțiunea ar da „relation bnm_rates does not exist".
    `CREATE TABLE IF NOT EXISTS "bnm_rates" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "rate_date" date NOT NULL,
      "code" varchar(3) NOT NULL,
      "name" varchar(120) NOT NULL DEFAULT '',
      "nominal" numeric(12,4) NOT NULL DEFAULT '1',
      "value" numeric(18,6) NOT NULL,
      "mdl_per_unit" numeric(18,8) NOT NULL,
      "fetched_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "bnm_rates_date_code_idx" ON "bnm_rates" ("rate_date","code")`,
    `CREATE INDEX IF NOT EXISTS "bnm_rates_date_idx" ON "bnm_rates" ("rate_date")`,
    `CREATE INDEX IF NOT EXISTS "bnm_rates_code_idx" ON "bnm_rates" ("code")`,
    // Migrarea 0161: catalogul de produse al CRM-ului. Tabelă NOUĂ pe calea de
    // request — healul generic adaugă doar coloane, nu tabele, iar Vercel pune
    // codul în producție înainte să termine migrările. Fără blocul ăsta, pagina
    // /business/crm/produse ar da 500 („relation crm_products does not exist")
    // până se aplică migrarea.
    `CREATE TABLE IF NOT EXISTS "crm_products" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "sku" varchar(60),
      "name" varchar(200) NOT NULL,
      "category" varchar(120),
      "description" text,
      "unit" varchar(30) NOT NULL DEFAULT 'buc',
      "list_price_cents" integer NOT NULL DEFAULT 0,
      "currency" varchar(8) NOT NULL DEFAULT 'MDL',
      "vat_percent" numeric NOT NULL DEFAULT '0',
      "is_active" boolean NOT NULL DEFAULT true,
      "order_index" integer NOT NULL DEFAULT 0,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "crm_products_tenant_idx" ON "crm_products" ("tenant_id")`,
    `CREATE INDEX IF NOT EXISTS "crm_products_active_idx" ON "crm_products" ("tenant_id","is_active")`,
    // CRM Faza 1: modulul citește `leads` + `lead_interactions` la fiecare
    // încărcare a pipeline-ului. Tabelele există din migrarea 0001, dar au
    // acumulat coloane mult mai târziu (valoare, companie, nume de oportunitate),
    // iar healul GENERIC de mai sus le adaugă fără DEFAULT/NOT NULL — ceea ce
    // pentru `value_cents`/`debt_cents` (NOT NULL DEFAULT 0) e insuficient.
    // Le punem explicit, ca la `par_requests.is_urgent`.
    `DO $$ BEGIN
      CREATE TYPE "lead_stage" AS ENUM ('new', 'contacted', 'trial', 'paid', 'lost');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "lead_source" AS ENUM ('webform', 'manual', 'facebook_ad', 'google_ads', 'referral', 'phone_in', 'instagram', 'import', 'other');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "interaction_type" AS ENUM ('note', 'call', 'email', 'whatsapp', 'sms', 'meeting', 'stage_change', 'system');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN
      CREATE TYPE "interaction_direction" AS ENUM ('inbound', 'outbound', 'internal');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `CREATE TABLE IF NOT EXISTS "leads" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL,
      "full_name" varchar(200) NOT NULL,
      "stage" "lead_stage" NOT NULL DEFAULT 'new',
      "source" "lead_source" NOT NULL DEFAULT 'manual',
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "lead_interactions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL,
      "lead_id" uuid NOT NULL,
      "type" "interaction_type" NOT NULL,
      "direction" "interaction_direction" NOT NULL DEFAULT 'internal',
      "body" varchar(2000),
      "metadata" jsonb,
      "user_id" uuid,
      "occurred_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    // Coloanele adăugate după 0001, cu modificatorii lor — healul generic le-ar
    // pune fără DEFAULT, iar rândurile existente ar rămâne NULL pe NOT NULL.
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "value_cents" integer DEFAULT 0 NOT NULL`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "debt_cents" integer DEFAULT 0 NOT NULL`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "company" varchar(300)`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "deal_name" varchar(300)`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "interest_course" varchar(200)`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lost_reason" varchar(500)`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "assigned_to" uuid`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "phone" varchar(32)`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "phone_normalized" varchar(32)`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "email" varchar(255)`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "email_normalized" varchar(255)`,
    `CREATE INDEX IF NOT EXISTS "leads_tenant_idx" ON "leads" ("tenant_id")`,
    `CREATE INDEX IF NOT EXISTS "leads_stage_idx" ON "leads" ("tenant_id","stage")`,
    `CREATE INDEX IF NOT EXISTS "li_lead_idx" ON "lead_interactions" ("lead_id","occurred_at")`,
    // CRM Faza 2: etape configurabile. `leads.stage` trece din enum în varchar —
    // healul generic NU schimbă tipuri, deci conversia stă aici, gardată, ca să
    // fie sigură dacă migrarea 0162 n-a apucat să ruleze pe prod.
    `DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'stage' AND data_type = 'USER-DEFINED'
      ) THEN
        ALTER TABLE "leads" ALTER COLUMN "stage" DROP DEFAULT;
        ALTER TABLE "leads" ALTER COLUMN "stage" TYPE varchar(64) USING "stage"::text;
        ALTER TABLE "leads" ALTER COLUMN "stage" SET DEFAULT 'new';
      END IF;
    END $$`,
    `CREATE TABLE IF NOT EXISTS "crm_pipeline_stages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "key" varchar(64) NOT NULL,
      "label" varchar(100) NOT NULL,
      "color" varchar(40) NOT NULL DEFAULT 'sky',
      "order_index" integer NOT NULL DEFAULT 0,
      "is_won" boolean NOT NULL DEFAULT false,
      "is_lost" boolean NOT NULL DEFAULT false,
      "is_default" boolean NOT NULL DEFAULT false,
      "probability_pct" integer NOT NULL DEFAULT 10,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "crm_stages_tenant_idx" ON "crm_pipeline_stages" ("tenant_id","order_index")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "crm_stages_tenant_key_uniq" ON "crm_pipeline_stages" ("tenant_id","key")`,
    // CRM Fazele 3-4: taskuri, motive de pierdere, firme, jurnal de import.
    // Toate sunt pe calea de request, deci au nevoie de CREATE TABLE explicit —
    // healul generic adaugă doar coloane, nu tabele.
    `CREATE TABLE IF NOT EXISTS "crm_lead_tasks" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
      "title" varchar(300) NOT NULL,
      "due_at" timestamp with time zone,
      "status" varchar(20) NOT NULL DEFAULT 'open',
      "assigned_to" uuid,
      "created_by" uuid,
      "completed_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "crm_tasks_tenant_idx" ON "crm_lead_tasks" ("tenant_id")`,
    `CREATE INDEX IF NOT EXISTS "crm_tasks_lead_idx" ON "crm_lead_tasks" ("lead_id")`,
    `CREATE INDEX IF NOT EXISTS "crm_tasks_due_idx" ON "crm_lead_tasks" ("tenant_id","status","due_at")`,
    `CREATE TABLE IF NOT EXISTS "crm_lost_reasons" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "label" varchar(200) NOT NULL,
      "order_index" integer NOT NULL DEFAULT 0,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "crm_lost_reasons_tenant_idx" ON "crm_lost_reasons" ("tenant_id","order_index")`,
    `CREATE TABLE IF NOT EXISTS "crm_companies" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "name" varchar(300) NOT NULL,
      "name_normalized" varchar(300),
      "idno" varchar(40),
      "industry" varchar(120),
      "region" varchar(120),
      "company_size" varchar(40),
      "annual_consumption_kwh" numeric,
      "website" varchar(300),
      "phone" varchar(32),
      "phone_normalized" varchar(32),
      "email" varchar(255),
      "email_normalized" varchar(255),
      "address" varchar(500),
      "notes" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS "crm_companies_tenant_idx" ON "crm_companies" ("tenant_id")`,
    `CREATE INDEX IF NOT EXISTS "crm_companies_name_idx" ON "crm_companies" ("tenant_id","name_normalized")`,
    `CREATE INDEX IF NOT EXISTS "crm_companies_phone_idx" ON "crm_companies" ("tenant_id","phone_normalized")`,
    `CREATE INDEX IF NOT EXISTS "crm_companies_email_idx" ON "crm_companies" ("tenant_id","email_normalized")`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "company_id" uuid`,
    `CREATE TABLE IF NOT EXISTS "crm_import_jobs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "file_name" varchar(300),
      "source" varchar(40) NOT NULL DEFAULT 'file',
      "mapping" jsonb,
      "total_rows" integer NOT NULL DEFAULT 0,
      "created_count" integer NOT NULL DEFAULT 0,
      "duplicate_count" integer NOT NULL DEFAULT 0,
      "error_count" integer NOT NULL DEFAULT 0,
      "errors" jsonb,
      "created_by" uuid,
      "created_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS "crm_import_mappings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "name" varchar(200) NOT NULL,
      "mapping" jsonb NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    )`,
    // Migrarea 0149: flag de urgență pe cerere. is_urgent e NOT NULL DEFAULT false — healul
    // generic de mai sus adaugă coloana FĂRĂ modificatori, deci rândurile existente ar rămâne
    // NULL. Explicit aici, ca la par_budget_codes.currency (migrarea 0147).
    `ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "is_urgent" boolean DEFAULT false NOT NULL`,
    `ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "urgent_reason" varchar(60)`,
    `ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "urgent_reason_note" text`,
    `ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "urgent_due_date" timestamp with time zone`,
    `CREATE INDEX IF NOT EXISTS "par_requests_urgent_idx" ON "par_requests" ("is_urgent")`,
    // Migrarea 0150: patenta de întreprinzător a beneficiarului. Flagurile sunt NOT NULL DEFAULT
    // false — healul generic le-ar adăuga fără modificatori, deci rândurile existente ar rămâne
    // NULL și formularul ar citi „nedefinit" în loc de „fără patentă".
    `ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "is_patent_holder" boolean DEFAULT false NOT NULL`,
    `ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_series" varchar(50)`,
    `ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_valid_until" varchar(10)`,
    `ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_is_patent_holder" boolean DEFAULT false NOT NULL`,
    `ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_series" varchar(50)`,
    `ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_valid_until" varchar(10)`,
    // Migrarea 0188: copia patentei (fișierul), pe beneficiar și pe cerere. Coloane nullable,
    // deci healul generic le-ar adăuga oricum — sunt aici explicit fiindcă `GET /api/par/:id` și
    // lista de beneficiari le citesc pe fiecare cerere: o coloană lipsă = formularul nu se deschide.
    `ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_file_path" text`,
    `ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_file_name" varchar(500)`,
    `ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_file_mime" varchar(100)`,
    `ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_file_size" integer`,
    `ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "patent_file_uploaded_at" timestamp with time zone`,
    `ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_file_path" text`,
    `ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_file_name" varchar(500)`,
    `ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_file_mime" varchar(100)`,
    `ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_file_size" integer`,
    `ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "payee_patent_file_uploaded_at" timestamp with time zone`,
    // Migrarea 0151: registrul de acte (DOCGEN). Tabele NOI pe calea unei cereri — fără heal,
    // pagina de acte ar da „relation doc_documents does not exist" până când migrarea ajunge.
    // Migrarea 0165: automatizări + distribuirea lead-urilor. Tabele NOI pe calea
    // creării unui lead — fără heal, salvarea unui lead ar pica cu „relation
    // crm_automations does not exist" până când migrarea ajunge pe workspace.
    `CREATE TABLE IF NOT EXISTS "crm_automations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "name" varchar(200) NOT NULL,
      "enabled" boolean DEFAULT true NOT NULL,
      "trigger" jsonb NOT NULL,
      "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "order_index" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "crm_automations_tenant_idx" ON "crm_automations" ("tenant_id","order_index")`,
    `CREATE TABLE IF NOT EXISTS "crm_automation_runs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "automation_id" uuid REFERENCES "crm_automations"("id") ON DELETE set null,
      "automation_name" varchar(200),
      "lead_id" uuid REFERENCES "leads"("id") ON DELETE cascade,
      "trigger_kind" varchar(40) NOT NULL,
      "actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "status" varchar(20) DEFAULT 'ok' NOT NULL,
      "error" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "crm_automation_runs_tenant_idx" ON "crm_automation_runs" ("tenant_id","created_at")`,
    `CREATE INDEX IF NOT EXISTS "crm_automation_runs_lead_idx" ON "crm_automation_runs" ("lead_id")`,
    `CREATE TABLE IF NOT EXISTS "crm_assignment_rules" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "name" varchar(200) NOT NULL,
      "enabled" boolean DEFAULT true NOT NULL,
      "strategy" varchar(20) DEFAULT 'round_robin' NOT NULL,
      "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "order_index" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "crm_assignment_rules_tenant_idx" ON "crm_assignment_rules" ("tenant_id","order_index")`,
    // CRM-A02 (0191): scenariile gata făcute. Tabelele de mai sus se creează DUPĂ bucla generică de
    // coloane, deci pe o bază fără ele coloana nouă n-ar apărea decât la deploy-ul următor.
    `ALTER TABLE "crm_automations" ADD COLUMN IF NOT EXISTS "template_key" varchar(60)`,
    `ALTER TABLE "crm_assignment_rules" ADD COLUMN IF NOT EXISTS "template_key" varchar(60)`,
    `CREATE TABLE IF NOT EXISTS "crm_sales_settings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "is_active" boolean DEFAULT true NOT NULL,
      "daily_capacity" integer DEFAULT 20 NOT NULL,
      "weight" integer DEFAULT 1 NOT NULL,
      "regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "industries" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "order_index" integer DEFAULT 0 NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "crm_sales_settings_tenant_idx" ON "crm_sales_settings" ("tenant_id","order_index")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "crm_sales_settings_user_uniq" ON "crm_sales_settings" ("tenant_id","user_id")`,
    `CREATE TABLE IF NOT EXISTS "crm_assignment_log" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "lead_id" uuid REFERENCES "leads"("id") ON DELETE cascade,
      "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
      "rule_id" uuid REFERENCES "crm_assignment_rules"("id") ON DELETE set null,
      "strategy" varchar(20),
      "reason" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS "crm_assignment_log_tenant_idx" ON "crm_assignment_log" ("tenant_id","created_at")`,
    `CREATE INDEX IF NOT EXISTS "crm_assignment_log_lead_idx" ON "crm_assignment_log" ("lead_id")`,
    // Migrarea 0194 (CRM-G09): aranjamentul personal al rapoartelor. Ecranul îl citește la fiecare
    // deschidere; fără tabelă cade pe aranjamentul implicit, dar salvarea n-ar avea unde scrie.
    `CREATE TABLE IF NOT EXISTS "crm_report_layouts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
      "layout" jsonb NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "crm_report_layouts_user_uniq" ON "crm_report_layouts" ("tenant_id","user_id")`,
    ...DOCGEN_ENSURE_STATEMENTS,
    // Migrarea 0176 — DUPĂ `DOCGEN_ENSURE_STATEMENTS`, fiindcă referă `doc_documents`, pe care
    // acelea o creează. Testul `docgen-schema` aplică lista pe o bază goală, în ordine, și
    // prinde exact inversarea asta.
    // Migrarea 0176: linkul public al actului. Ecranul de documente îl citește la fiecare
    // listare (ca să arate „Vizualizat"), deci fără tabelă lista de acte 500-ește.
    `CREATE TABLE IF NOT EXISTS "doc_share_links" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
      "document_id" uuid NOT NULL REFERENCES "doc_documents"("id") ON DELETE cascade,
      "token" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
      "expires_at" timestamp with time zone,
      "revoked_at" timestamp with time zone,
      "first_viewed_at" timestamp with time zone,
      "last_viewed_at" timestamp with time zone,
      "view_count" integer DEFAULT 0 NOT NULL,
      "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "doc_share_links_document_uniq" ON "doc_share_links" ("document_id")`,
    `CREATE INDEX IF NOT EXISTS "doc_share_links_token_idx" ON "doc_share_links" ("token")`,
    ...PAR_VENDOR_PROFILE_ENSURE_STATEMENTS,
    ...PAR_DRIVE_ENSURE_STATEMENTS,
    ...CRM_PARITY_ENSURE_STATEMENTS,
    ...PONTAJ_ENSURE_STATEMENTS,
    // Migrarea 0154 (audit perf): indexuri compuse/parțiale pe interogările hot-path ale PAR —
    // fără migrări fiabile pe prod, indexurile trebuie create explicit aici, nu doar în migrare.
    `CREATE INDEX IF NOT EXISTS "par_payer_modules_tenant_module_idx" ON "par_payer_modules" ("tenant_id","module_key")`,
    `CREATE INDEX IF NOT EXISTS "par_requests_tenant_created_idx" ON "par_requests" ("tenant_id","created_at" DESC)`,
    `CREATE INDEX IF NOT EXISTS "par_requests_tenant_status_submitted_idx" ON "par_requests" ("tenant_id","status","submitted_at" DESC)`,
    `CREATE INDEX IF NOT EXISTS "par_requests_tenant_date_of_request_idx" ON "par_requests" ("tenant_id","date_of_request")`,
    `CREATE INDEX IF NOT EXISTS "par_requests_tenant_purpose_status_idx" ON "par_requests" ("tenant_id","purpose","status")`,
    `CREATE INDEX IF NOT EXISTS "par_requests_project_idx" ON "par_requests" ("project_id")`,
    `CREATE INDEX IF NOT EXISTS "par_requests_event_idx" ON "par_requests" ("event_id")`,
    `CREATE INDEX IF NOT EXISTS "par_requests_budget_code_idx" ON "par_requests" ("budget_code_id")`,
    `CREATE INDEX IF NOT EXISTS "par_requests_department_idx" ON "par_requests" ("department_id")`,
    `CREATE INDEX IF NOT EXISTS "par_approvals_tenant_pending_unlocked_idx" ON "par_approvals" ("tenant_id") WHERE "decision" = 'pending' AND "locked" = false`,
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
