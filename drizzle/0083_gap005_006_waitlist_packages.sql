ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "max_students" integer;
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "recovery_included" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course_waitlist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "course_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "position" integer NOT NULL,
  "notified_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "cwl_unique_entry" UNIQUE ("course_id", "student_id")
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "course_waitlist" ADD CONSTRAINT "course_waitlist_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "course_waitlist" ADD CONSTRAINT "course_waitlist_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "course_waitlist" ADD CONSTRAINT "course_waitlist_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cwl_tenant_idx" ON "course_waitlist" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cwl_course_idx" ON "course_waitlist" USING btree ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cwl_position_idx" ON "course_waitlist" USING btree ("course_id", "position");
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "public"."lesson_package_status" AS ENUM ('active', 'exhausted', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "course_id" uuid NOT NULL,
  "invoice_id" uuid,
  "units_total" integer NOT NULL,
  "units_remaining" integer NOT NULL,
  "auto_renew" boolean DEFAULT false NOT NULL,
  "recovery_included_in_package" boolean DEFAULT true NOT NULL,
  "valid_from" date NOT NULL,
  "valid_until" date,
  "status" "lesson_package_status" DEFAULT 'active' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lesson_packages" ADD CONSTRAINT "lesson_packages_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_tenant_idx" ON "lesson_packages" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_student_idx" ON "lesson_packages" USING btree ("student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_course_idx" ON "lesson_packages" USING btree ("course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_status_idx" ON "lesson_packages" USING btree ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lp_active_student_course_idx" ON "lesson_packages" USING btree ("student_id", "course_id", "status");
