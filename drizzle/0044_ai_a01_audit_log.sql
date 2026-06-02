CREATE TABLE IF NOT EXISTS "ai_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(64) DEFAULT 'system' NOT NULL,
	"model" varchar(100) DEFAULT 'stub' NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd_micro" integer DEFAULT 0 NOT NULL,
	"pseudonymized" boolean DEFAULT true NOT NULL,
	"entity_type" varchar(64),
	"entity_id" uuid,
	"status" varchar(32) DEFAULT 'completed' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "views" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "starts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "completions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "ai_audit_log" ADD CONSTRAINT "ai_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "ai_audit_log" ADD CONSTRAINT "ai_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_al_tenant_idx" ON "ai_audit_log" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_al_user_idx" ON "ai_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_al_action_idx" ON "ai_audit_log" USING btree ("tenant_id","action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_al_created_idx" ON "ai_audit_log" USING btree ("tenant_id","created_at");
