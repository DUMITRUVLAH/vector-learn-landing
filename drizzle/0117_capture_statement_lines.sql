-- INVOICE-REPORTING (statements): a bank statement (one upload) holds many transactions.
-- Add fin_captures.kind ("document" | "statement") + fin_capture_lines child table where the
-- AI extracts each transaction as its own reviewable line. See backlog/specs/INVOICE-REPORTING.md.
--
-- fin_captures is a pre-existing table in prod (from CRM split) with no CREATE migration in
-- this repo. Bootstrap it unconditionally with IF NOT EXISTS so PGlite (CI / schema-drift gate)
-- also creates it. Prod already has it; IF NOT EXISTS is a no-op there.

CREATE TABLE IF NOT EXISTS "fin_captures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "expense_id" uuid,
  "file_key" varchar(500) NOT NULL DEFAULT '',
  "file_name" varchar(255) NOT NULL DEFAULT '',
  "mime_type" varchar(100) NOT NULL DEFAULT '',
  "size_bytes" integer NOT NULL DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "team" varchar(20) NOT NULL DEFAULT 'other',
  "extracted_fields" jsonb,
  "raw_text" text,
  "reportable" varchar(10) NOT NULL DEFAULT 'review',
  "reportable_reason" text,
  "reportable_confidence_bp" integer NOT NULL DEFAULT 0,
  "document_class" varchar(12) NOT NULL DEFAULT 'review',
  "document_class_reason" text,
  "document_class_confidence_bp" integer NOT NULL DEFAULT 0,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "kind" varchar(20) NOT NULL DEFAULT 'document',
  "error_message" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'document';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fin_capture_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "capture_id" uuid NOT NULL REFERENCES "fin_captures"("id") ON DELETE CASCADE,
  "tx_date" varchar(10),
  "description" text NOT NULL DEFAULT '',
  "counterparty" varchar(300),
  "amount_cents" integer NOT NULL DEFAULT 0,
  "direction" varchar(4) NOT NULL DEFAULT 'out',
  "currency" varchar(3) NOT NULL DEFAULT 'MDL',
  "orig_amount" varchar(40),
  "reportable" varchar(10) NOT NULL DEFAULT 'review',
  "reportable_reason" text,
  "reportable_confidence_bp" integer NOT NULL DEFAULT 0,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_capture_lines_capture_idx" ON "fin_capture_lines" ("capture_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_capture_lines_tenant_idx" ON "fin_capture_lines" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_capture_lines_tenant_reportable_idx" ON "fin_capture_lines" ("tenant_id", "reportable");
