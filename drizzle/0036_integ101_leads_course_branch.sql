-- INTEG-101: Add course_id and branch_id to leads table
-- course_id: FK to courses(id) ON DELETE SET NULL — curs de interes structural
-- branch_id: UUID nullable — FK constraint to branches(id) deferred until BRANCH-701 merges to main

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "course_id" uuid;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "branch_id" uuid;
--> statement-breakpoint
-- course_id FK (courses table exists on main)
DO $$ BEGIN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_course_id_courses_id_fk"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
