-- INVOICE-REPORTING (statements): a bank statement (one upload) holds many transactions.
-- Add fin_captures.kind ("document" | "statement") + fin_capture_lines child table where the
-- AI extracts each transaction as its own reviewable line. See backlog/specs/INVOICE-REPORTING.md.
--
-- Guarded with to_regclass (fin_captures CREATE migration isn't in this repo — pre-existing
-- fin_* drift from the CRM split; prod has the table, fresh PGlite does not).
DO $$
BEGIN
  IF to_regclass('public.fin_captures') IS NOT NULL THEN
    ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'document';

    CREATE TABLE IF NOT EXISTS "fin_capture_lines" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
      "capture_id" uuid NOT NULL REFERENCES "fin_captures"("id") ON DELETE CASCADE,
      "tx_date" varchar(10),
      "description" text NOT NULL,
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

    CREATE INDEX IF NOT EXISTS "fin_capture_lines_capture_idx" ON "fin_capture_lines" ("capture_id");
    CREATE INDEX IF NOT EXISTS "fin_capture_lines_tenant_idx" ON "fin_capture_lines" ("tenant_id");
    CREATE INDEX IF NOT EXISTS "fin_capture_lines_tenant_reportable_idx" ON "fin_capture_lines" ("tenant_id", "reportable");
  END IF;
END $$;
