-- MOB-102: Homework assignments and submissions
-- Adds homework table (per student per lesson) and homework_submissions.

CREATE TYPE "public"."homework_status" AS ENUM('pending', 'submitted', 'graded');--> statement-breakpoint
CREATE TABLE "homework" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"body" text NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"status" "homework_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homework_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"homework_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"text_body" text,
	"image_url" varchar(500),
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework" ADD CONSTRAINT "homework_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_homework_id_homework_id_fk" FOREIGN KEY ("homework_id") REFERENCES "public"."homework"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hw_tenant_idx" ON "homework" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "hw_student_idx" ON "homework" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "hw_lesson_idx" ON "homework" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "hw_deadline_idx" ON "homework" USING btree ("student_id","deadline");--> statement-breakpoint
CREATE INDEX "hws_tenant_idx" ON "homework_submissions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "hws_homework_idx" ON "homework_submissions" USING btree ("homework_id");--> statement-breakpoint
CREATE INDEX "hws_student_idx" ON "homework_submissions" USING btree ("student_id");
