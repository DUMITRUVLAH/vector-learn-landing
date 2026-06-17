-- INVOICE-REPORTING (matching): link each bank-statement transaction line to the uploaded
-- invoice/payment-confirmation that covers it. The accountant uploads the statement PDF and the
-- invoices into the same Invoice Reporting inbox; "Match" then answers, per transaction, "is there
-- an invoice for this in the system? yes/no" — so they don't check each one by hand.
--   match_status:    "matched" (an invoice was found) | "missing" (none) | "review" (not run / unsure)
--   matched_capture_id: the fin_captures (single-document) row the line was matched to (or set manually)
--   match_score_bp:  matcher confidence in basis points (0..10000)
--
-- Guarded with to_regclass like 0117/0119 (fin_captures/fin_capture_lines CREATE isn't in this repo —
-- pre-existing fin_* drift from the CRM split; prod has the tables, fresh PGlite does not).
DO $$
BEGIN
  IF to_regclass('public.fin_capture_lines') IS NOT NULL THEN
    ALTER TABLE "fin_capture_lines" ADD COLUMN IF NOT EXISTS "match_status" varchar(10) NOT NULL DEFAULT 'review';
    ALTER TABLE "fin_capture_lines" ADD COLUMN IF NOT EXISTS "matched_capture_id" uuid REFERENCES "fin_captures"("id") ON DELETE SET NULL;
    ALTER TABLE "fin_capture_lines" ADD COLUMN IF NOT EXISTS "match_score_bp" integer NOT NULL DEFAULT 0;
    CREATE INDEX IF NOT EXISTS "fin_capture_lines_tenant_match_idx" ON "fin_capture_lines" ("tenant_id", "match_status");
  END IF;
END $$;
