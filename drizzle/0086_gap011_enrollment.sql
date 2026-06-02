ALTER TABLE "cohorts" ADD COLUMN IF NOT EXISTS "slug" varchar(200);
--> statement-breakpoint
ALTER TABLE "cohorts" ADD COLUMN IF NOT EXISTS "max_participants" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cohorts_tenant_slug_uniq" ON "cohorts" ("tenant_id", "slug");
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "enrollment_request_status" AS ENUM ('pending', 'paid', 'waitlisted', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "enrollment_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "cohort_id" uuid NOT NULL REFERENCES "cohorts"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "email" varchar(255) NOT NULL,
  "phone" varchar(32),
  "status" "enrollment_request_status" NOT NULL DEFAULT 'pending',
  "stripe_session_id" varchar(200),
  "created_student_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "er_tenant_idx" ON "enrollment_requests" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "er_cohort_idx" ON "enrollment_requests" ("cohort_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "er_email_idx" ON "enrollment_requests" ("email");
