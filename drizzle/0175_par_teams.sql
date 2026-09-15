-- VM5-22: echipe PAR — coechipierii își văd cererile între ei, inclusiv ciornele.
-- Vezi server/lib/par/teamScope.ts pentru regula de vizibilitate.

CREATE TABLE IF NOT EXISTS "par_teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" varchar(200) NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_teams_tenant_idx" ON "par_teams" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_teams_tenant_name_uniq" ON "par_teams" ("tenant_id","name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_team_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "team_id" uuid NOT NULL REFERENCES "par_teams"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_team_members_team_idx" ON "par_team_members" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_team_members_user_idx" ON "par_team_members" ("tenant_id","user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_team_members_team_user_uniq" ON "par_team_members" ("team_id","user_id");
