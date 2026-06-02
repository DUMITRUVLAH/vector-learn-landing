ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "sla_hot_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "sla_default_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "rot_days" integer DEFAULT 7 NOT NULL;