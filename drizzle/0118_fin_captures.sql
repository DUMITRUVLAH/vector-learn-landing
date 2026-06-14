-- CAPTURE-001: FinDesk — Capturi OCR AI (fin_captures)
-- Enum: fin_capture_status
-- Table: fin_captures
-- Indexes: tenant, tenant+status, expense_id
--
-- FK on expense_id → fin_expenses.id added conditionally (if table exists)
-- so this migration can run independently of SPEND's 0119_fin_expenses.sql
-- order. The FK is enforced at application level until both are merged.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_capture_status') THEN
    CREATE TYPE "public"."fin_capture_status" AS ENUM (
      'pending',
      'processing',
      'extracted',
      'confirmed',
      'failed'
    );
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fin_captures" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"        UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "expense_id"       UUID,
  "file_key"         VARCHAR(500) NOT NULL,
  "file_name"        VARCHAR(255) NOT NULL,
  "mime_type"        VARCHAR(100) NOT NULL,
  "size_bytes"       INTEGER NOT NULL,
  "status"           "fin_capture_status" NOT NULL DEFAULT 'pending',
  "extracted_fields" JSONB,
  "raw_text"         TEXT,
  "error_message"    TEXT,
  "confirmed_by"     UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "confirmed_at"     TIMESTAMPTZ,
  "created_by"       UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_captures_tenant_idx"
  ON "fin_captures"("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_captures_tenant_status_idx"
  ON "fin_captures"("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_captures_expense_idx"
  ON "fin_captures"("expense_id");
