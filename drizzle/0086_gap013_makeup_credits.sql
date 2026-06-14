CREATE TABLE IF NOT EXISTS "makeup_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"reason" varchar(50) DEFAULT 'cancelled' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"makeup_lesson_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_credits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_credits_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_credits_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "makeup_credits" ADD CONSTRAINT "makeup_credits_makeup_lesson_id_lessons_id_fk" FOREIGN KEY ("makeup_lesson_id") REFERENCES "lessons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "makeup_tenant_idx" ON "makeup_credits" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "makeup_student_idx" ON "makeup_credits" ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "makeup_lesson_idx" ON "makeup_credits" ("tenant_id","lesson_id");
