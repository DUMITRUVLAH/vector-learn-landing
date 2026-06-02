-- GAP-012: Gradebook / student progress — progress_skills + progress_entries
-- Migration idx: 29

CREATE TABLE IF NOT EXISTS "progress_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500),
	"sort_order" integer NOT NULL DEFAULT 0,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "progress_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"lesson_id" uuid,
	"score" integer NOT NULL,
	"comment" varchar(1000),
	"evaluated_by" uuid,
	"evaluated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);

--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "progress_skills" ADD CONSTRAINT "progress_skills_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "progress_skills" ADD CONSTRAINT "progress_skills_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_skill_id_progress_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."progress_skills"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_evaluated_by_teachers_id_fk" FOREIGN KEY ("evaluated_by") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "prskills_tenant_idx" ON "progress_skills" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "prskills_course_idx" ON "progress_skills" USING btree ("tenant_id","course_id");
CREATE INDEX IF NOT EXISTS "prentries_tenant_idx" ON "progress_entries" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "prentries_student_idx" ON "progress_entries" USING btree ("tenant_id","student_id");
CREATE INDEX IF NOT EXISTS "prentries_skill_idx" ON "progress_entries" USING btree ("tenant_id","skill_id");
CREATE INDEX IF NOT EXISTS "prentries_time_idx" ON "progress_entries" USING btree ("tenant_id","student_id","evaluated_at");
