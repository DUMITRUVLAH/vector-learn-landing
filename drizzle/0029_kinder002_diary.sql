CREATE TYPE "public"."diary_event_type" AS ENUM('meal', 'nap', 'diaper', 'activity', 'photo', 'note');--> statement-breakpoint
CREATE TABLE "daily_report_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"event_date" date NOT NULL,
	"event_type" "diary_event_type" NOT NULL,
	"details" jsonb,
	"photo_url" text,
	"staff_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_report_events" ADD CONSTRAINT "daily_report_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_events" ADD CONSTRAINT "daily_report_events_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_report_events" ADD CONSTRAINT "daily_report_events_staff_user_id_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_report_events_tenant_idx" ON "daily_report_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "daily_report_events_student_date_idx" ON "daily_report_events" USING btree ("student_id","event_date");--> statement-breakpoint
CREATE INDEX "daily_report_events_tenant_date_idx" ON "daily_report_events" USING btree ("tenant_id","event_date");