DO $$
BEGIN
  CREATE TYPE "public"."recovery_status" AS ENUM('pending', 'reserved', 'expired', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recovery_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_lesson_id" uuid NOT NULL,
	"status" "recovery_status" DEFAULT 'pending' NOT NULL,
	"suggested_slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reserved_lesson_id" uuid,
	"token" varchar(500) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_requests_token_unique" UNIQUE("token"),
	CONSTRAINT "rr_student_lesson_uniq" UNIQUE("student_lesson_id")
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "recovery_included" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "recovery_requests" ADD CONSTRAINT "recovery_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "recovery_requests" ADD CONSTRAINT "recovery_requests_student_lesson_id_student_lessons_id_fk" FOREIGN KEY ("student_lesson_id") REFERENCES "public"."student_lessons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "recovery_requests" ADD CONSTRAINT "recovery_requests_reserved_lesson_id_lessons_id_fk" FOREIGN KEY ("reserved_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rr_tenant_idx" ON "recovery_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rr_token_idx" ON "recovery_requests" USING btree ("token");