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
];
