ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "logo_url" varchar(500);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "branding_json" jsonb;
