-- GAP-019: Gamification badges — student_badges table
-- Only adds the student_badges table and its indexes.
-- All other tables (notifications, saved_views, cohorts, etc.) were added in migrations 0017-0027.
CREATE TABLE IF NOT EXISTS "student_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"badge_type" varchar(50) NOT NULL,
	"awarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"awarded_reason" text,
	CONSTRAINT "student_badges_unique" UNIQUE("tenant_id","student_id","badge_type")
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "student_badges" ADD CONSTRAINT "student_badges_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_badges_tenant_idx" ON "student_badges" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_badges_student_idx" ON "student_badges" USING btree ("student_id");
