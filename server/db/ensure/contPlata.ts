/**
 * CONTPLATA-faza-1 — healul de producție pentru migrarea 0196.
 *
 * Coloanele noi de pe `payment_accounts`, `payment_account_items` și `seller_profiles` le adaugă
 * healul generic din sync-schema.ts. TABELA nouă, `payment_account_templates`, nu — de aceea e
 * declarată aici, idempotent, câte un statement per element. Fără ea, lista de șabloane din editor
 * ar răspunde „relation does not exist" până ajunge (sau nu) migrarea.
 */
export const CONT_PLATA_ENSURE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "payment_account_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"name" varchar(200) NOT NULL,
	"buyer" jsonb,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"currency" varchar(3) DEFAULT 'MDL' NOT NULL,
	"notes" text,
	"due_days" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS "payment_account_templates_tenant_idx" ON "payment_account_templates" ("tenant_id")`,
  // Garda de ultimă instanță contra dublurilor: numărul unui cont e unic în organizație.
  `CREATE UNIQUE INDEX IF NOT EXISTS "payment_accounts_docnum_uniq" ON "payment_accounts" ("tenant_id","document_number") WHERE "document_number" IS NOT NULL`,
];
