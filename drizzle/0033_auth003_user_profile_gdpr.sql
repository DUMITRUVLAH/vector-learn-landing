ALTER TABLE "users" ADD COLUMN "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "language" varchar(10) DEFAULT 'ro';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "timezone" varchar(64) DEFAULT 'Europe/Bucharest';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;