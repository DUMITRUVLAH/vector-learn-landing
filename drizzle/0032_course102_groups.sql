-- COURSE-102: Groups table — classes/recurring groups as scheduling entities
CREATE TABLE IF NOT EXISTS "groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "course_id" uuid NOT NULL REFERENCES "courses"("id") ON DELETE RESTRICT,
  "teacher_id" uuid REFERENCES "teachers"("id") ON DELETE SET NULL,
  "room_id" uuid REFERENCES "rooms"("id") ON DELETE SET NULL,
  "name" varchar(200) NOT NULL,
  "schedule_template" jsonb,
  "max_students" integer NOT NULL DEFAULT 20,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "groups_tenant_idx" ON "groups" ("tenant_id");
CREATE INDEX IF NOT EXISTS "groups_course_idx" ON "groups" ("course_id");
CREATE INDEX IF NOT EXISTS "groups_status_idx" ON "groups" ("tenant_id", "status");
