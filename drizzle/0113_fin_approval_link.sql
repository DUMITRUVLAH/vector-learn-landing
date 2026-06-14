-- APPROVAL-001: Link payments to PAR approval workflow
-- Adds par_request_id (nullable FK) to payments table
-- MIGRATION COLLISION NOTE: this branch uses 0115 — if merged after feat/FIN-multicurrency,
-- renumber to the next available idx (0117 or higher).

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "par_request_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_par_request_id_par_requests_fk'
  ) THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_par_request_id_par_requests_fk"
      FOREIGN KEY ("par_request_id")
      REFERENCES "par_requests"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_par_request_idx"
  ON "payments" ("par_request_id")
  WHERE "par_request_id" IS NOT NULL;
