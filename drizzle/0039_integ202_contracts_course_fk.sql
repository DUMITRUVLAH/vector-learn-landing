-- INTEG-202: Add course_id to contracts table
-- Nullable UUID (FK→courses ON DELETE SET NULL). Backward compatible.
-- contracts.course (varchar) preserved for display/templates.

ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "course_id" uuid;
DO $$ BEGIN
  ALTER TABLE "contracts" ADD CONSTRAINT "contracts_course_id_courses_id_fk"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
