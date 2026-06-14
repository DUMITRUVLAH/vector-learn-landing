-- MASS-003: FinDesk cheltuieli (fin_expenses + fin_expense_attachments)
-- Copied from feat/FIN-spend (originally 0119 there; renumbered 0120 here to avoid collision).
-- COLLISION NOTE: feat/FIN-spend uses 0119_fin_expenses.sql — must renumber at merge.
-- import_hash column added separately in 0121_fin_spend_import_hash.sql

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_expense_category') THEN
    CREATE TYPE "public"."fin_expense_category" AS ENUM (
      'rent',
      'utilities',
      'salaries',
      'marketing',
      'supplies',
      'software',
      'maintenance',
      'other'
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_expense_source') THEN
    CREATE TYPE "public"."fin_expense_source" AS ENUM (
      'manual',
      'capture',
      'payroll',
      'asset'
    );
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_expense_status') THEN
    CREATE TYPE "public"."fin_expense_status" AS ENUM (
      'draft',
      'approved',
      'rejected',
      'paid'
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fin_expenses" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"        UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "category"         "fin_expense_category" NOT NULL,
  "amount_cents"     INTEGER NOT NULL,
  "currency"         VARCHAR(3) NOT NULL DEFAULT 'MDL',
  "vat_deductible"   BOOLEAN NOT NULL,
  "vat_amount_cents" INTEGER NOT NULL DEFAULT 0,
  "source"           "fin_expense_source" NOT NULL DEFAULT 'manual',
  "status"           "fin_expense_status" NOT NULL DEFAULT 'draft',
  "description"      TEXT,
  "reference"        VARCHAR(100),
  "vendor_name"      VARCHAR(200),
  "expense_date"     DATE NOT NULL,
  "paid_at"          TIMESTAMPTZ,
  "approved_by"      UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at"      TIMESTAMPTZ,
  "created_by"       UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_expenses_tenant_idx"
  ON "fin_expenses"("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_expenses_tenant_category_idx"
  ON "fin_expenses"("tenant_id", "category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_expenses_tenant_status_idx"
  ON "fin_expenses"("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_expenses_tenant_date_idx"
  ON "fin_expenses"("tenant_id", "expense_date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fin_expense_attachments" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "expense_id"  UUID NOT NULL REFERENCES "fin_expenses"("id") ON DELETE CASCADE,
  "file_key"    VARCHAR(500) NOT NULL,
  "file_name"   VARCHAR(255) NOT NULL,
  "mime_type"   VARCHAR(100) NOT NULL,
  "size_bytes"  INTEGER NOT NULL,
  "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_expense_att_expense_idx"
  ON "fin_expense_attachments"("expense_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_expense_att_tenant_idx"
  ON "fin_expense_attachments"("tenant_id");
