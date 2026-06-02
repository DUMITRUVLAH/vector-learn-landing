DO $$
BEGIN
  CREATE TYPE "public"."incident_status" AS ENUM('open', 'parent_notified', 'acknowledged', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpointDO $$
BEGIN
  CREATE TYPE "public"."incident_type" AS ENUM('fall', 'bite', 'cut', 'allergy', 'behavioral', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incident_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"reported_by_user_id" uuid,
	"incident_date" date NOT NULL,
	"incident_time" varchar(5),
	"type" "incident_type" DEFAULT 'other' NOT NULL,
	"description" text NOT NULL,
	"injury_location" varchar(200),
	"first_aid_given" text,
	"witness_name" varchar(200),
	"parent_notified_at" timestamp with time zone,
	"parent_signature_url" text,
	"parent_acknowledged_at" timestamp with time zone,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "incident_reports" ADD CONSTRAINT "incident_reports_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_reports_tenant_idx" ON "incident_reports" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_reports_student_idx" ON "incident_reports" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_reports_tenant_date_idx" ON "incident_reports" USING btree ("tenant_id","incident_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_reports_status_idx" ON "incident_reports" USING btree ("status");