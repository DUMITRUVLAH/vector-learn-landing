ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "rr_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "rr_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "rr_index" integer DEFAULT 0 NOT NULL;