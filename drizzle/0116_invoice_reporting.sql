-- INVOICE-REPORTING: add AI reportability verdict + human review fields to fin_captures.
-- The accountant uploads CSV/PDF; AI decides if each item is "for reporting"; a reviewer
-- confirms/overrides. See backlog/specs/INVOICE-REPORTING.md.
--
-- Guarded with to_regclass: the fin_captures CREATE-TABLE migration was never copied to this
-- repo (pre-existing fin_* drift from the CRM split; prod has the table, fresh PGlite does not).
-- On prod the ALTERs run; on a table-less DB the block no-ops instead of failing the whole reset.
DO $$
BEGIN
  IF to_regclass('public.fin_captures') IS NOT NULL THEN
    ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "reportable" varchar(10) NOT NULL DEFAULT 'review';
    ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "reportable_reason" text;
    ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "reportable_confidence_bp" integer NOT NULL DEFAULT 0;
    ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
    ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
    ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "review_note" text;
    CREATE INDEX IF NOT EXISTS "fin_captures_tenant_reportable_idx" ON "fin_captures" ("tenant_id", "reportable");
  END IF;
END $$;
