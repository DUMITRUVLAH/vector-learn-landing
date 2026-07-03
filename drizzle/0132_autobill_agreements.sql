-- AUTOBILL: per-contract opt-in for fully automatic recurring billing (generate invoice →
-- submit to SFS e-Factura → email PDF to the client, run daily by the cron).
ALTER TABLE "fin_agreements" ADD COLUMN IF NOT EXISTS "auto_billing" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "fin_agreements" ADD COLUMN IF NOT EXISTS "auto_billed_at" timestamp with time zone;
