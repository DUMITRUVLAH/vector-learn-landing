-- CRM Faza 3: taskuri pe lead + motive de pierdere configurabile.
-- Portate din crm-vector; aici fiecare rând aparține unui workspace.
CREATE TABLE IF NOT EXISTS "crm_lead_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
	"title" varchar(300) NOT NULL,
	"due_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"assigned_to" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_tasks_tenant_idx" ON "crm_lead_tasks" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_tasks_lead_idx" ON "crm_lead_tasks" ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_tasks_due_idx" ON "crm_lead_tasks" ("tenant_id","status","due_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_lost_reasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"label" varchar(200) NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_lost_reasons_tenant_idx" ON "crm_lost_reasons" ("tenant_id","order_index");
