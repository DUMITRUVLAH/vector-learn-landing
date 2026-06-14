-- TRUST-001: FinDesk Data Trust & Privacy Settings
-- Table: fin_data_settings
-- One row per tenant. Controls PII anonymization, log retention, and AI opt-in.
-- FIN-CORE §1.16

CREATE TABLE IF NOT EXISTS "fin_data_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pseudonymize_ai_prompts" boolean NOT NULL DEFAULT true,
	"ai_log_retention_days" integer NOT NULL DEFAULT 90,
	"ai_opt_in" boolean NOT NULL DEFAULT false,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fin_data_settings"
  ADD CONSTRAINT "fds_tenant_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fds_tenant_uniq" ON "fin_data_settings" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fds_tenant_idx" ON "fin_data_settings" ("tenant_id");
