DO $$
BEGIN
  CREATE TYPE "public"."admission_status" AS ENUM('draft', 'submitted', 'review', 'accepted', 'waitlisted', 'rejected', 'enrolled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "public"."admission_doc_status" AS ENUM('required', 'received', 'verified');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"applicant_name" varchar(200) NOT NULL,
	"applicant_email" varchar(200),
	"applicant_phone" varchar(50),
	"guardian_name" varchar(200),
	"guardian_phone" varchar(50),
	"grade_level" varchar(10) NOT NULL,
	"status" "admission_status" DEFAULT 'draft' NOT NULL,
	"lead_id" uuid,
	"decision_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admission_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"status" "admission_doc_status" DEFAULT 'required' NOT NULL,
	"uploaded_at" timestamp with time zone,
	"notes" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "admission_applications" ADD CONSTRAINT "admission_applications_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "admission_documents" ADD CONSTRAINT "admission_documents_application_id_admission_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."admission_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_applications_tenant_year_status_idx" ON "admission_applications" USING btree ("tenant_id","academic_year_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_applications_tenant_status_idx" ON "admission_applications" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admission_documents_tenant_application_idx" ON "admission_documents" USING btree ("tenant_id","application_id");
