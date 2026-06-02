-- BRANCH-701: Create branches table + add branch_id to students/teachers/courses/lessons
CREATE TABLE IF NOT EXISTS "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"address" text,
	"manager_user_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN IF NOT EXISTS "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "branch_id" uuid;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "branches" ADD CONSTRAINT "branches_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branches_tenant_idx" ON "branches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "branches_tenant_default_idx" ON "branches" USING btree ("tenant_id","is_default");--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "students" ADD CONSTRAINT "students_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "teachers" ADD CONSTRAINT "teachers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "courses" ADD CONSTRAINT "courses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lessons" ADD CONSTRAINT "lessons_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "students_branch_idx" ON "students" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teachers_branch_idx" ON "teachers" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "courses_branch_idx" ON "courses" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lessons_branch_idx" ON "lessons" USING btree ("branch_id");
