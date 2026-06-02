CREATE TABLE IF NOT EXISTS "certificate_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid,
	"cohort_id" uuid,
	"name" varchar(200) NOT NULL,
	"background_url" varchar(1000),
	"fields_config" jsonb,
	"is_global" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "issued_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"certificate_id" varchar(100) NOT NULL,
	"cohort_id" uuid,
	"template_id" uuid,
	"participant_name" varchar(300) NOT NULL,
	"course_name" varchar(300) NOT NULL,
	"edition" varchar(100),
	"mentor_name" varchar(200),
	"completion_date" date,
	"verification_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"pdf_url" varchar(1000),
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issued_cert_tenant_certid_uniq" UNIQUE("tenant_id","certificate_id"),
	CONSTRAINT "issued_certificates_verification_token_unique" UNIQUE("verification_token")
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "issued_certificates" ADD CONSTRAINT "issued_certificates_template_id_certificate_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."certificate_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cert_tmpl_tenant_global_idx" ON "certificate_templates" USING btree ("tenant_id","is_global");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cert_tmpl_tenant_course_idx" ON "certificate_templates" USING btree ("tenant_id","course_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issued_cert_tenant_idx" ON "issued_certificates" USING btree ("tenant_id");
