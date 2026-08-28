-- FX-001: oglinda locală a cursului oficial BNM. Date publice, deci fără tenant_id.
CREATE TABLE IF NOT EXISTS "bnm_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_date" date NOT NULL,
	"code" varchar(3) NOT NULL,
	"name" varchar(120) DEFAULT '' NOT NULL,
	"nominal" numeric(12, 4) DEFAULT '1' NOT NULL,
	"value" numeric(18, 6) NOT NULL,
	"mdl_per_unit" numeric(18, 8) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bnm_rates_date_code_idx" ON "bnm_rates" ("rate_date","code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bnm_rates_date_idx" ON "bnm_rates" ("rate_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bnm_rates_code_idx" ON "bnm_rates" ("code");
