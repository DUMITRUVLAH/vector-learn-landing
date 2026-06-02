-- SET-802: Add branding + data retention columns to tenants table
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "logo_url" varchar(2048);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "branding_json" jsonb;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "data_retention_json" jsonb;
