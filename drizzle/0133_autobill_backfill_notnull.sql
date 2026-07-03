-- AUTOBILL: enforce the auto_billing contract on databases where the column was self-healed
-- (nullable, no default) instead of created by migration 0132 — prod's drizzle tracking is
-- desynced, so sync-schema created it first and 0132's ADD COLUMN IF NOT EXISTS no-op'd.
-- Idempotent everywhere: fresh DBs already have NOT NULL DEFAULT false from 0132.
UPDATE "fin_agreements" SET "auto_billing" = false WHERE "auto_billing" IS NULL;--> statement-breakpoint
ALTER TABLE "fin_agreements" ALTER COLUMN "auto_billing" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "fin_agreements" ALTER COLUMN "auto_billing" SET NOT NULL;
