ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "cefr_level" varchar(4);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courses_status_idx" ON "courses" ("tenant_id", "status");
