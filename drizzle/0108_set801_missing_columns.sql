-- SET-801: Add missing leads columns that were in schema but not in migrations
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
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_revoked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "merged_into_id" uuid;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "company" varchar(300);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "deal_name" varchar(300);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "preferred_days" jsonb;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "preferred_time_start" time;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "preferred_time_end" time;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "email_normalized" varchar(255);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_name_idx" ON "leads" USING btree ("tenant_id","full_name_normalized");
