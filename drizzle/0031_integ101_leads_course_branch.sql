-- INTEG-101: Add course_id and branch_id to leads table
-- course_id: FK to courses(id) ON DELETE SET NULL — curs de interes structural
-- branch_id: UUID nullable — FK constraint to branches(id) deferred until BRANCH-701 merges to main

ALTER TABLE "leads" ADD COLUMN "course_id" uuid;
ALTER TABLE "leads" ADD COLUMN "branch_id" uuid;

-- course_id FK (courses table exists on main)
ALTER TABLE "leads" ADD CONSTRAINT "leads_course_id_courses_id_fk"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL;
