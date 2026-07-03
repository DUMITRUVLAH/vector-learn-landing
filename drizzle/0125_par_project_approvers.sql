-- VF-approval-scoping: project-scoped approvers. A project with rows here restricts who can approve
-- its PARs to the listed users; a project with no rows → any approver (default).
-- Prefix 0125 (> 0124_par_events_created_by, the current last migration on main).
CREATE TABLE "par_project_approvers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"project_id" uuid NOT NULL REFERENCES "par_projects"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "par_project_approvers_project_idx" ON "par_project_approvers" ("project_id");
--> statement-breakpoint
CREATE INDEX "par_project_approvers_tenant_idx" ON "par_project_approvers" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "par_project_approvers_project_user_uniq" ON "par_project_approvers" ("project_id","user_id");
