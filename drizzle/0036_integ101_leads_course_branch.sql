ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "course_id" uuid;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "branch_id" uuid;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_course_id_courses_id_fk"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
