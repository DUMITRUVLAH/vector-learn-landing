-- MASS-003: Adaugă coloana import_hash la fin_expenses pentru import idempotent CSV
-- SHA-256 hex al rândului CSV => skip dacă există deja (AC10 MASS-003)

ALTER TABLE "fin_expenses"
  ADD COLUMN IF NOT EXISTS "import_hash" VARCHAR(64);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_expenses_import_hash_idx"
  ON "fin_expenses"("tenant_id", "import_hash");
