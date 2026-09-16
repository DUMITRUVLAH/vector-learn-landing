-- Pre-aprobatorii de proiect: semnătura cerută ÎNAINTEA lanțului DOA.
-- Cererea owner-ului (16.09.2026): cererile depuse de asistentul de proiect mergeau direct la
-- finanțe, iar managerul de proiect le vedea abia după plată. Rândurile de aici adaugă un pas nou
-- la începutul lanțului, spre deosebire de par_project_approvers, care doar restrânge pașii
-- existenți. Vezi server/db/schema/par.ts (parProjectPreApprovers).
CREATE TABLE IF NOT EXISTS "par_project_pre_approvers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"project_id" uuid NOT NULL REFERENCES "par_projects"("id") ON DELETE cascade,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_project_pre_approvers_project_idx" ON "par_project_pre_approvers" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_project_pre_approvers_tenant_idx" ON "par_project_pre_approvers" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_project_pre_approvers_project_user_uniq" ON "par_project_pre_approvers" ("project_id","user_id");
