-- SCHOOL-002: Schema catalog de note (gradebook)
-- Tabele noi: school_subjects, grade_entries
-- Enum nou: grade_type

DO $$ BEGIN
  CREATE TYPE "public"."grade_type" AS ENUM('test', 'homework', 'oral', 'final');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "school_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(20),
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "grade_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"teacher_id" uuid,
	"value" numeric(5, 2) NOT NULL,
	"weight" numeric(4, 2) DEFAULT '1' NOT NULL,
	"type" "grade_type" DEFAULT 'test' NOT NULL,
	"title" varchar(200),
	"graded_at" date NOT NULL,
	"notes" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "school_subjects" ADD CONSTRAINT "school_subjects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_class_id_school_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_subject_id_school_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."school_subjects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_term_id_academic_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."academic_terms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "grade_entries" ADD CONSTRAINT "grade_entries_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "school_subjects_tenant_idx" ON "school_subjects" USING btree ("tenant_id");
--> statement-breakpoint
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grade_entries_tenant_class_student_idx" ON "grade_entries" USING btree ("tenant_id","class_id","student_id");
--> statement-breakpoint
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grade_entries_tenant_student_term_idx" ON "grade_entries" USING btree ("tenant_id","student_id","term_id");
--> statement-breakpoint
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grade_entries_tenant_subject_term_idx" ON "grade_entries" USING btree ("tenant_id","subject_id","term_id");
