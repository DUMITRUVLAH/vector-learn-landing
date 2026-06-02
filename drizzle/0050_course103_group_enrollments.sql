-- COURSE-103: group_enrollments table — student↔group association
CREATE TABLE IF NOT EXISTS "group_enrollments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "enrolled_at" timestamptz NOT NULL DEFAULT now(),
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_enrollments_tenant_idx" ON "group_enrollments" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_enrollments_group_idx" ON "group_enrollments" ("group_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_enrollments_student_idx" ON "group_enrollments" ("student_id");
--> statement-breakpoint
-- Unique: one enrollment per student per group (soft-remove doesn't delete, just status='removed')
ALTER TABLE "group_enrollments"
  ADD CONSTRAINT "group_enrollments_unique" UNIQUE ("group_id", "student_id");
