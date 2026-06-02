CREATE TABLE IF NOT EXISTS "user_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'teacher' NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_by_user_id" uuid,
	CONSTRAINT "user_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ui_tenant_idx" ON "user_invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ui_email_idx" ON "user_invitations" USING btree ("tenant_id","email");