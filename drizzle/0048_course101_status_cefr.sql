-- COURSE-101: Add status and cefr_level columns to courses
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "status" varchar(16) NOT NULL DEFAULT 'active';
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "cefr_level" varchar(4);

CREATE INDEX IF NOT EXISTS "courses_status_idx" ON "courses" ("tenant_id", "status");
