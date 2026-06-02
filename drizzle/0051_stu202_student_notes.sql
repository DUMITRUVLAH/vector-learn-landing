-- STU-202: student_notes — internal timeline notes per student
-- Professors, managers, and reception staff can add notes visible only internally.
-- noteType is a soft VARCHAR enum (not Postgres enum) to avoid ALTER TYPE migrations.

CREATE TABLE IF NOT EXISTS "student_notes" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "author_name" varchar(255) NOT NULL,
  "body" text NOT NULL,
  "note_type" varchar(32) DEFAULT 'general' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sn_tenant_student_idx" ON "student_notes" ("tenant_id", "student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sn_created_at_idx" ON "student_notes" ("tenant_id", "student_id", "created_at");
