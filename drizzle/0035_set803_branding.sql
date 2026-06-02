ALTER TABLE "tenants" ADD COLUMN "logo_url" varchar(500);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "branding_json" jsonb;
