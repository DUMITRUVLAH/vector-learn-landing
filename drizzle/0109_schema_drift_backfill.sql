-- 0109: Backfill schema drift — columns/tables declared in code (server/db/schema) but never
-- migrated, so a fresh DB (local PGlite, tests, fresh prod deploy) 500s / fails to seed.
-- Caught by src/__tests__/schema-drift.test.ts. All statements are idempotent (IF NOT EXISTS /
-- duplicate_object guards) so this is safe on prod where sync-schema.ts may have already added
-- some of these columns at deploy time.

-- CRM-104: webhook_events table (idempotency log for Meta/Google lead webhooks) — never migrated.
DO $$ BEGIN
  CREATE TYPE "public"."webhook_provider" AS ENUM('facebook_lead_ads', 'google_ads');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "provider" "webhook_provider" NOT NULL,
  "external_id" varchar(200) NOT NULL,
  "payload" varchar(8000),
  "lead_id" uuid,
  "is_duplicate" varchar(5) NOT NULL DEFAULT 'false',
  "processed_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "webhook_events"
  ADD CONSTRAINT "webhook_events_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "we_tenant_idx" ON "webhook_events" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "we_external_idx" ON "webhook_events" USING btree ("tenant_id", "provider", "external_id");
--> statement-breakpoint
-- leads: columns added in code (CRM-101/102/104) with no migration.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "full_name_normalized" varchar(200);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "leadgen_id" varchar(200);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "meta_form_id" varchar(200);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "meta_ad_id" varchar(200);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "user_agent_at_consent" varchar(512);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "merged_into_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_name_idx" ON "leads" USING btree ("tenant_id", "full_name_normalized");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_leadgen_idx" ON "leads" USING btree ("tenant_id", "leadgen_id");
--> statement-breakpoint
-- homework_submissions: notes + created_at added in code with no migration.
ALTER TABLE "homework_submissions" ADD COLUMN IF NOT EXISTS "notes" text;
--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone NOT NULL DEFAULT now();
