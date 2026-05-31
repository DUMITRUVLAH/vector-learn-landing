CREATE TYPE "public"."recurrence_type" AS ENUM('weekly');--> statement-breakpoint
CREATE TABLE "lesson_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"label" varchar(300) NOT NULL,
	"recurrence_type" "recurrence_type" DEFAULT 'weekly' NOT NULL,
	"day_of_week" integer NOT NULL,
	"occurrences" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "lesson_series" ADD CONSTRAINT "lesson_series_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lesson_series_tenant_idx" ON "lesson_series" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_series_id_lesson_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."lesson_series"("id") ON DELETE set null ON UPDATE no action;