DO $$
BEGIN
  CREATE TYPE "public"."course_status" AS ENUM('active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"author_id" uuid,
	"author_name" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"note_type" varchar(32) DEFAULT 'general' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "status" "course_status" DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "views" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "starts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "completions" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "student_notes" ADD CONSTRAINT "student_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sn_tenant_student_idx" ON "student_notes" USING btree ("tenant_id","student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sn_created_at_idx" ON "student_notes" USING btree ("tenant_id","student_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courses_status_idx" ON "courses" USING btree ("status");
