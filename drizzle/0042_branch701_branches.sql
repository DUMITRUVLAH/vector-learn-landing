-- BRANCH-701: Branches (filiale) entity + branch_id on key tables
-- Adds multi-branch support: students, teachers, lessons, courses can belong to a branch.
-- branch_id is nullable: NULL means "default / unassigned".
-- Migration prefix: 0031 (follows 0030_forms005_analytics on main branch)

CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"address" varchar(500),
	"manager_user_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_manager_user_id_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "branches_tenant_idx" ON "branches" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "branches_default_idx" ON "branches" USING btree ("tenant_id","is_default");--> statement-breakpoint

-- Add branch_id to students
ALTER TABLE "students" ADD COLUMN "branch_id" uuid REFERENCES "branches"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "students_branch_idx" ON "students" USING btree ("tenant_id","branch_id");--> statement-breakpoint

-- Add branch_id to teachers
ALTER TABLE "teachers" ADD COLUMN "branch_id" uuid REFERENCES "branches"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "teachers_branch_idx" ON "teachers" USING btree ("tenant_id","branch_id");--> statement-breakpoint

-- Add branch_id to lessons
ALTER TABLE "lessons" ADD COLUMN "branch_id" uuid REFERENCES "branches"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "lessons_branch_idx" ON "lessons" USING btree ("tenant_id","branch_id");--> statement-breakpoint

-- Add branch_id to courses
ALTER TABLE "courses" ADD COLUMN "branch_id" uuid REFERENCES "branches"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "courses_branch_idx" ON "courses" USING btree ("tenant_id","branch_id");
