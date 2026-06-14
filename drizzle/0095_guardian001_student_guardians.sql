-- GUARDIAN-001: Authorized guardians — student_guardians table
-- Migration prefix: 0034 (follows 0033_school006_timetable)
-- No CREATE TYPE needed (all columns are standard types)

CREATE TABLE IF NOT EXISTS "student_guardians" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "full_name" varchar(200) NOT NULL,
  "relationship" varchar(50),
  "phone" varchar(32),
  "email" varchar(255),
  "is_primary" boolean NOT NULL DEFAULT false,
  "has_custody" boolean NOT NULL DEFAULT true,
  "can_pickup" boolean NOT NULL DEFAULT true,
  "receives_communications" boolean NOT NULL DEFAULT true,
  "notes" varchar(500),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "student_guardians_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "student_guardians_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_guardians_tenant_student_idx" ON "student_guardians" ("tenant_id", "student_id");
