-- CX-701: Cohort (edition) model
-- A cohort is a concrete run of a course with schedule and cost info.

CREATE TABLE IF NOT EXISTS "cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"label" varchar(300) NOT NULL,
	"start_date" date NOT NULL,
	"total_hours" integer DEFAULT 32 NOT NULL,
	"hours_per_session" integer DEFAULT 2 NOT NULL,
	"schedule_days" jsonb,
	"is_online" boolean DEFAULT false NOT NULL,
	"manual_end_date" date,
	"mentor_cost_cents" integer DEFAULT 0 NOT NULL,
	"room_cost_cents" integer DEFAULT 0 NOT NULL,
	"drive_folder_url" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cohorts_tenant_course_idx" ON "cohorts" USING btree ("tenant_id","course_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cohorts_tenant_start_idx" ON "cohorts" USING btree ("tenant_id","start_date");
