-- SET-801: Team management — invitations table + users.is_active
-- Note: form_logic, forms.views/starts/completions already exist on main from FORMS-004/005 PRs.
-- This migration only adds what's new on this branch.
CREATE TABLE IF NOT EXISTS "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'manager' NOT NULL,
	"token" varchar(128) NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_tenant_idx" ON "invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_token_idx" ON "invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invitations_email_tenant_idx" ON "invitations" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_is_active_idx" ON "users" USING btree ("tenant_id","is_active");
