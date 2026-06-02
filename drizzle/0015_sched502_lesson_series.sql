DO $$ BEGIN
  CREATE TYPE "public"."recurrence_type" AS ENUM('weekly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lesson_series" (
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
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "series_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "lesson_series" ADD CONSTRAINT "lesson_series_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lesson_series_tenant_idx" ON "lesson_series" USING btree ("tenant_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "lessons" ADD CONSTRAINT "lessons_series_id_lesson_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."lesson_series"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;