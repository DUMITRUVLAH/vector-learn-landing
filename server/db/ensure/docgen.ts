/**
 * DOCGEN-101 — healul de producție pentru registrul de acte.
 *
 * De ce e nevoie de el pe lângă migrarea 0151: Vercel livrează CODUL înaintea migrărilor, iar pe
 * producție evidența migrărilor drizzle e desincronizată (docs/solutions/database-issues +
 * memoria „prod-migration-tracking-desynced"). Fără heal, prima cerere către pagina de acte ar
 * răspunde „relation doc_documents does not exist" — adică modulul ar fi mort pentru clientul care
 * plătește, până când cineva rulează manual migrarea.
 *
 * Healul generic din sync-schema.ts adaugă doar COLOANE lipsă; TABELELE noi trebuie declarate aici,
 * explicit și idempotent (`IF NOT EXISTS`), câte un singur statement per element (fără `;` multiple).
 * Ordinea contează: doc_documents înaintea celor care au FK spre el.
 */
export const DOCGEN_ENSURE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "doc_documents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "template_id" uuid,
    "template_version" integer DEFAULT 1 NOT NULL,
    "kind" varchar(50) DEFAULT 'act_primire_predare' NOT NULL,
    "doc_number" varchar(50),
    "doc_year" integer,
    "doc_date" timestamp with time zone DEFAULT now() NOT NULL,
    "title" varchar(300) NOT NULL,
    "status" varchar(20) DEFAULT 'draft' NOT NULL,
    "project_id" uuid,
    "event_id" uuid,
    "payer_id" uuid,
    "counterparty_kind" varchar(20) DEFAULT 'vendor' NOT NULL,
    "counterparty_id" uuid,
    "counterparty_name" varchar(300),
    "counterparty_snapshot" text,
    "context" text DEFAULT '{}' NOT NULL,
    "body_html" text DEFAULT '' NOT NULL,
    "total_cents" integer DEFAULT 0 NOT NULL,
    "currency" varchar(3) DEFAULT 'MDL' NOT NULL,
    "body_hash" varchar(64),
    "pdf_url" text,
    "created_by_user_id" uuid,
    "finalized_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "cancel_reason" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "doc_document_lines" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "document_id" uuid NOT NULL REFERENCES "doc_documents"("id") ON DELETE cascade,
    "position" integer DEFAULT 1 NOT NULL,
    "description" text NOT NULL,
    "unit" varchar(50) DEFAULT 'buc' NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price_cents" integer DEFAULT 0 NOT NULL,
    "line_total_cents" integer DEFAULT 0 NOT NULL,
    "vat_percent" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "doc_document_links" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "from_document_id" uuid NOT NULL REFERENCES "doc_documents"("id") ON DELETE cascade,
    "to_kind" varchar(20) NOT NULL,
    "to_document_id" uuid,
    "to_par_id" uuid,
    "relation" varchar(50) DEFAULT 'derived_from' NOT NULL,
    "created_by_user_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "doc_number_sequences" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "kind" varchar(50) NOT NULL,
    "year" integer NOT NULL,
    "prefix" varchar(20) DEFAULT 'ACT' NOT NULL,
    "last_number" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "doc_audit" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "document_id" uuid NOT NULL REFERENCES "doc_documents"("id") ON DELETE cascade,
    "actor_user_id" uuid,
    "action" varchar(50) NOT NULL,
    "details" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "doc_template_versions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "template_id" uuid NOT NULL,
    "version" integer NOT NULL,
    "name" varchar(200) NOT NULL,
    "body_html" text NOT NULL,
    "created_by_user_id" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "doc_template_versions_template_idx" ON "doc_template_versions" ("template_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "doc_template_versions_uniq" ON "doc_template_versions" ("template_id","version")`,
  `CREATE INDEX IF NOT EXISTS "doc_documents_tenant_idx" ON "doc_documents" ("tenant_id")`,
  `CREATE INDEX IF NOT EXISTS "doc_documents_status_idx" ON "doc_documents" ("tenant_id","status")`,
  `CREATE INDEX IF NOT EXISTS "doc_documents_project_idx" ON "doc_documents" ("project_id")`,
  `CREATE INDEX IF NOT EXISTS "doc_documents_counterparty_idx" ON "doc_documents" ("counterparty_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "doc_documents_number_uniq" ON "doc_documents" ("tenant_id","kind","doc_year","doc_number")`,
  `CREATE INDEX IF NOT EXISTS "doc_document_lines_document_idx" ON "doc_document_lines" ("document_id")`,
  `CREATE INDEX IF NOT EXISTS "doc_document_lines_tenant_idx" ON "doc_document_lines" ("tenant_id")`,
  `CREATE INDEX IF NOT EXISTS "doc_document_links_from_idx" ON "doc_document_links" ("from_document_id")`,
  `CREATE INDEX IF NOT EXISTS "doc_document_links_to_doc_idx" ON "doc_document_links" ("to_document_id")`,
  `CREATE INDEX IF NOT EXISTS "doc_document_links_to_par_idx" ON "doc_document_links" ("to_par_id")`,
  `CREATE INDEX IF NOT EXISTS "doc_document_links_tenant_idx" ON "doc_document_links" ("tenant_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "doc_number_sequences_uniq" ON "doc_number_sequences" ("tenant_id","kind","year")`,
  `CREATE INDEX IF NOT EXISTS "doc_audit_document_idx" ON "doc_audit" ("document_id")`,
  `CREATE INDEX IF NOT EXISTS "doc_audit_tenant_idx" ON "doc_audit" ("tenant_id")`,
  // Coloanele noi pe biblioteca de șabloane: NOT NULL cu default, deci healul generic (care le-ar
  // adăuga fără modificatori) ar lăsa rândurile existente cu NULL — vezi par_budget_codes.currency.
  `ALTER TABLE "docmerge_templates" ADD COLUMN IF NOT EXISTS "kind" varchar(50) DEFAULT 'other' NOT NULL`,
  `ALTER TABLE "docmerge_templates" ADD COLUMN IF NOT EXISTS "category" varchar(100)`,
  `ALTER TABLE "docmerge_templates" ADD COLUMN IF NOT EXISTS "is_system" boolean DEFAULT false NOT NULL`,
  `ALTER TABLE "docmerge_templates" ADD COLUMN IF NOT EXISTS "fields_json" text DEFAULT '[]' NOT NULL`,
  `ALTER TABLE "docmerge_templates" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL`,
  `ALTER TABLE "docmerge_templates" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone`,
];
