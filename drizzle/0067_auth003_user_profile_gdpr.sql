ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "language" varchar(10) DEFAULT 'ro';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" varchar(64) DEFAULT 'Europe/Bucharest';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;