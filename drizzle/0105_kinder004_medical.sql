DO $$ BEGIN
  CREATE TYPE "public"."reaction_type" AS ENUM('mild', 'moderate', 'severe');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "child_allergies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"allergen" varchar(200) NOT NULL,
	"reaction_type" "reaction_type" DEFAULT 'mild' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "immunization_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"vaccine_name" varchar(200) NOT NULL,
	"administered_date" date,
	"next_due_date" date,
	"provider" varchar(200),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "medication_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"log_date" date NOT NULL,
	"medication_name" varchar(200) NOT NULL,
	"dosage" varchar(100) NOT NULL,
	"administered_at" timestamp with time zone NOT NULL,
	"administered_by_user_id" uuid,
	"parent_consent" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "child_allergies" ADD CONSTRAINT "child_allergies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "child_allergies" ADD CONSTRAINT "child_allergies_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "immunization_records" ADD CONSTRAINT "immunization_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "immunization_records" ADD CONSTRAINT "immunization_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "medication_log" ADD CONSTRAINT "medication_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "medication_log" ADD CONSTRAINT "medication_log_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "medication_log" ADD CONSTRAINT "medication_log_administered_by_user_id_users_id_fk" FOREIGN KEY ("administered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "child_allergies_tenant_idx" ON "child_allergies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "child_allergies_student_idx" ON "child_allergies" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "immunization_records_tenant_idx" ON "immunization_records" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "immunization_records_student_idx" ON "immunization_records" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "immunization_records_due_date_idx" ON "immunization_records" USING btree ("next_due_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medication_log_tenant_idx" ON "medication_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medication_log_student_date_idx" ON "medication_log" USING btree ("student_id","log_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "medication_log_tenant_date_idx" ON "medication_log" USING btree ("tenant_id","log_date");