/**
 * Heal pentru tabelele CRM din Faza 9 (paritate cu crm-vector).
 *
 * `sync-schema` adaugă generic COLOANE lipsă, dar nu și TABELE — iar producția nu aplică fiabil
 * migrările (vezi comentariul din `server/db/sync-schema.ts`). Fără instrucțiunile de mai jos,
 * primul GET care atinge o tabelă nouă dă 500 până când migrarea ajunge acolo.
 *
 * Toate sunt idempotente (`IF NOT EXISTS`) și non-distructive. O singură instrucțiune per intrare
 * — executorul le rulează una câte una.
 */
export const CRM_PARITY_ENSURE_STATEMENTS: string[] = [
  // ── Pâlnii multiple (migrarea 0166) ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "crm_pipelines" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "name" varchar(200) NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "crm_pipelines_tenant_idx" ON "crm_pipelines" ("tenant_id","order_index")`,
  // Unicitatea cheii de etapă se mută pe (tenant, pâlnie, key). Indexul vechi trebuie să dispară,
  // altfel a doua pâlnie nu-și poate crea propria etapă „new".
  `DROP INDEX IF EXISTS "crm_stages_tenant_key_uniq"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "crm_stages_tenant_pipeline_key_uniq" ON "crm_pipeline_stages" ("tenant_id","pipeline_id","key")`,
  `CREATE INDEX IF NOT EXISTS "crm_stages_pipeline_idx" ON "crm_pipeline_stages" ("pipeline_id","order_index")`,
  `CREATE INDEX IF NOT EXISTS "leads_pipeline_idx" ON "leads" ("tenant_id","pipeline_id")`,

  // ── Vizualizări salvate (migrarea 0167) ────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "crm_saved_views" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "name" varchar(200) NOT NULL,
    "filters" jsonb NOT NULL,
    "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
    "is_shared" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "crm_saved_views_tenant_idx" ON "crm_saved_views" ("tenant_id")`,
  `CREATE INDEX IF NOT EXISTS "crm_saved_views_owner_idx" ON "crm_saved_views" ("tenant_id","created_by_user_id")`,

  // ── Contacte, câmpuri personalizate, fișiere (migrarea 0007 + 0168) ─────────
  // Tabelele există din 0007, dar n-au avut niciodată rute — deci nici heal. De acum sunt pe
  // calea cererilor: fără instrucțiunile astea, prima deschidere a filei „Contacte" pe un
  // workspace unde 0007 n-a ajuns ar da 500.
  `CREATE TABLE IF NOT EXISTS "lead_contacts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
    "full_name" varchar(200) NOT NULL,
    "role" varchar(100),
    "phone" varchar(32),
    "email" varchar(255),
    "is_primary" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "lc_tenant_idx" ON "lead_contacts" ("tenant_id")`,
  `CREATE INDEX IF NOT EXISTS "lc_lead_idx" ON "lead_contacts" ("lead_id")`,
  `DO $$ BEGIN
    CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'select', 'number');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$`,
  `CREATE TABLE IF NOT EXISTS "custom_fields" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "key" varchar(64) NOT NULL,
    "label" varchar(200) NOT NULL,
    "type" "custom_field_type" DEFAULT 'text' NOT NULL,
    "options" jsonb,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "cf_tenant_idx" ON "custom_fields" ("tenant_id")`,
  `CREATE TABLE IF NOT EXISTS "lead_field_values" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
    "field_id" uuid NOT NULL REFERENCES "custom_fields"("id") ON DELETE cascade,
    "value" varchar(1000),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "lfv_lead_idx" ON "lead_field_values" ("lead_id")`,
  `CREATE TABLE IF NOT EXISTS "lead_attachments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
    "file_name" varchar(300) NOT NULL,
    "storage_path" varchar(512),
    "file_url" varchar(1000),
    "mime" varchar(100) NOT NULL,
    "size_bytes" integer DEFAULT 0 NOT NULL,
    "uploaded_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  // Tabela putea exista deja din 0002, cu `file_url` obligatoriu și fără `storage_path`.
  `ALTER TABLE "lead_attachments" ALTER COLUMN "file_url" DROP NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "la_lead_idx" ON "lead_attachments" ("lead_id")`,

  // ── Cadențe + reactivare (migrarea 0169) ───────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "crm_cadences" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "name" varchar(200) NOT NULL,
    "trigger_stage" varchar(64),
    "enabled" boolean DEFAULT true NOT NULL,
    "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "crm_cadences_tenant_idx" ON "crm_cadences" ("tenant_id")`,
  `CREATE TABLE IF NOT EXISTS "crm_cadence_enrollments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
    "cadence_id" uuid NOT NULL REFERENCES "crm_cadences"("id") ON DELETE cascade,
    "status" varchar(20) DEFAULT 'active' NOT NULL,
    "current_step" integer DEFAULT 0 NOT NULL,
    "next_fire_at" timestamp with time zone,
    "enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "crm_enrollments_due_idx" ON "crm_cadence_enrollments" ("tenant_id","status","next_fire_at")`,
  `CREATE TABLE IF NOT EXISTS "crm_reengagement_rules" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "name" varchar(200) NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "after_months" integer DEFAULT 6 NOT NULL,
    "lost_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "stage_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "action" varchar(30) DEFAULT 'create_task' NOT NULL,
    "cadence_id" uuid REFERENCES "crm_cadences"("id") ON DELETE set null,
    "task_title" varchar(300),
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "crm_reeng_rules_tenant_idx" ON "crm_reengagement_rules" ("tenant_id","order_index")`,
  `CREATE TABLE IF NOT EXISTS "crm_reengagement_runs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "rule_id" uuid NOT NULL REFERENCES "crm_reengagement_rules"("id") ON DELETE cascade,
    "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
    "ran_at" timestamp with time zone DEFAULT now() NOT NULL,
    "result" varchar(20) DEFAULT 'ok' NOT NULL,
    CONSTRAINT "crm_reeng_runs_rule_lead_uniq" UNIQUE("rule_id","lead_id")
  )`,

  // ── Produsul și probabilitatea pe oportunitate (migrarea 0171) ─────────────
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "product_id" uuid`,
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "probability_pct" integer`,
  `CREATE INDEX IF NOT EXISTS "leads_product_idx" ON "leads" ("tenant_id","product_id")`,

  // ── Captarea lead-urilor de pe site (migrarea 0172) ─────────────────────────
  `CREATE TABLE IF NOT EXISTS "crm_capture_sources" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "name" varchar(200) NOT NULL,
    "token" varchar(64) NOT NULL,
    "default_source" varchar(40) DEFAULT 'webform' NOT NULL,
    "pipeline_id" uuid,
    "allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "leads_captured" integer DEFAULT 0 NOT NULL,
    "last_capture_at" timestamp with time zone,
    "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "crm_capture_tenant_idx" ON "crm_capture_sources" ("tenant_id")`,
  // Unic pe tot sistemul: tokenul determină workspace-ul, deci o coliziune ar scrie leadul în
  // baza altui client.
  `CREATE UNIQUE INDEX IF NOT EXISTS "crm_capture_token_uniq" ON "crm_capture_sources" ("token")`,

  // ── Excepții de drepturi pe om (migrarea 0174) ──────────────────────────────
  `CREATE TABLE IF NOT EXISTS "crm_user_permissions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "permission" varchar(64) NOT NULL,
    "granted" boolean DEFAULT true NOT NULL,
    "granted_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "crm_user_perms_uniq" UNIQUE("user_id","permission")
  )`,
  `CREATE INDEX IF NOT EXISTS "crm_user_perms_tenant_idx" ON "crm_user_permissions" ("tenant_id","user_id")`,

  // ── Stoc pe produse (migrarea 0177) ────────────────────────────────────────
  // Stocul propriu-zis stă în `fin_inventory_items` (modulul FinDesk); aici doar legătura,
  // cantitatea vândută pe oportunitate și ancora de idempotență a scăderii.
  `ALTER TABLE "crm_products" ADD COLUMN IF NOT EXISTS "inventory_item_id" uuid`,
  `CREATE INDEX IF NOT EXISTS "crm_products_inventory_idx" ON "crm_products" ("tenant_id","inventory_item_id")`,
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "product_qty" integer DEFAULT 1 NOT NULL`,
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "stock_movement_id" uuid`,

  // ── Norme KPI (migrarea 0180) ──────────────────────────────────────────────
  // Fără heal, primul „Rapoarte" deschis pe un workspace unde migrarea n-a ajuns ar da 500 —
  // iar raportul de vânzări e ecranul pe care managerul îl deschide zilnic.
  `CREATE TABLE IF NOT EXISTS "crm_kpi_targets" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
    "period" varchar(16) DEFAULT 'week' NOT NULL,
    "metric" varchar(40) NOT NULL,
    "target" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "crm_kpi_targets_tenant_idx" ON "crm_kpi_targets" ("tenant_id")`,
  // Două indexuri PARȚIALE, nu unul singur: în Postgres, două rânduri cu `user_id` NULL nu se
  // ciocnesc într-un index unic obișnuit, deci norma generală s-ar putea dubla în tăcere.
  `CREATE UNIQUE INDEX IF NOT EXISTS "crm_kpi_targets_user_uniq" ON "crm_kpi_targets" ("tenant_id","user_id","period","metric") WHERE "user_id" IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "crm_kpi_targets_default_uniq" ON "crm_kpi_targets" ("tenant_id","period","metric") WHERE "user_id" IS NULL`,
];
