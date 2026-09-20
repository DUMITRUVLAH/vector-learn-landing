CREATE TABLE IF NOT EXISTS "crm_kpi_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"period" varchar(16) DEFAULT 'week' NOT NULL,
	"metric" varchar(40) NOT NULL,
	"target" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_kpi_targets" ADD CONSTRAINT "crm_kpi_targets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "crm_kpi_targets" ADD CONSTRAINT "crm_kpi_targets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_kpi_targets_tenant_idx" ON "crm_kpi_targets" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_kpi_targets_user_uniq" ON "crm_kpi_targets" ("tenant_id","user_id","period","metric") WHERE "user_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_kpi_targets_default_uniq" ON "crm_kpi_targets" ("tenant_id","period","metric") WHERE "user_id" IS NULL;
