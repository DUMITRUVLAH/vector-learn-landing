-- CRM-127: CRM Audit log table
-- Migration prefix: 0010 (avoids collision with 0009_crm126_cadences)

CREATE TABLE IF NOT EXISTS "crm_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid,
	"entity_type" varchar(64) DEFAULT 'lead' NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(64) NOT NULL,
	"before_snapshot" jsonb,
	"after_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "crm_audit_log" ADD CONSTRAINT "crm_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "crm_audit_log" ADD CONSTRAINT "crm_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "cal_tenant_time_idx" ON "crm_audit_log" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cal_entity_idx" ON "crm_audit_log" USING btree ("entity_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cal_actor_idx" ON "crm_audit_log" USING btree ("tenant_id","actor_id");
