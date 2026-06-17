-- CAPTURE-DOCCLASS: add AI document-class verdict to fin_captures.
-- Before trusting the extracted financial fields, the AI classifies WHAT the upload is
-- ("invoice" | "receipt" | "not_invoice" | "review"). Lets the team/accountant spot a
-- wrongly-uploaded file (contract, random photo) instead of it being silently processed
-- as an expense. Distinct from `reportable` (tax-reporting question). "Flag, don't block."
--
-- Guarded with to_regclass like 0116: the fin_captures CREATE-TABLE migration was never
-- copied to this repo (pre-existing fin_* drift from the CRM split; prod has the table,
-- fresh PGlite does not). On prod the ALTERs run; on a table-less DB the block no-ops.
DO $$
BEGIN
  IF to_regclass('public.fin_captures') IS NOT NULL THEN
    ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "document_class" varchar(12) NOT NULL DEFAULT 'review';
    ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "document_class_reason" text;
    ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "document_class_confidence_bp" integer NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS "fin_captures_tenant_docclass_idx" ON "fin_captures" ("tenant_id", "document_class");
  END IF;
END $$;
