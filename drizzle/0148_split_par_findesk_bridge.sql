-- SPLIT-202: PAR → FinDesk bridge
-- 1. Extend fin_expense_source enum with 'par' value (ADD VALUE IF NOT EXISTS — idempotent)
-- 2. Add par_request_id column on fin_expenses (ADD COLUMN IF NOT EXISTS — idempotent)

ALTER TYPE "fin_expense_source" ADD VALUE IF NOT EXISTS 'par';
--> statement-breakpoint
ALTER TABLE "fin_expenses" ADD COLUMN IF NOT EXISTS "par_request_id" uuid;
--> statement-breakpoint

-- FK guard: idempotent, FK to par_requests
DO $$ BEGIN
  ALTER TABLE "fin_expenses"
    ADD CONSTRAINT "fin_expenses_par_request_id_fk"
    FOREIGN KEY ("par_request_id")
    REFERENCES "par_requests"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Index for fast lookup: "all fin_expenses for a given PAR"
CREATE INDEX IF NOT EXISTS "fin_expenses_par_request_idx" ON "fin_expenses" ("par_request_id");
