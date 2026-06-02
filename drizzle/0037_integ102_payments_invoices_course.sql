-- INTEG-102: Add course_id to payments and invoices tables
-- Both nullable (backward compatible). FK→courses(id) ON DELETE SET NULL.
-- Enables revenue-per-course analytics.

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "course_id" uuid;
DO $$ BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_course_id_courses_id_fk"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "course_id" uuid;
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_course_id_courses_id_fk"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
