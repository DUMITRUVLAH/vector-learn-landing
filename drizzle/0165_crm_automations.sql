-- CRM Faza 7 — automatizări și distribuirea lead-urilor.
-- Oamenii NU se dublează: `crm_sales_settings` atârnă de `users`, nu e un roster paralel.

CREATE TABLE IF NOT EXISTS "crm_automations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" varchar(200) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "trigger" jsonb NOT NULL,
  "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "order_index" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_automations_tenant_idx" ON "crm_automations" ("tenant_id","order_index");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_automation_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "automation_id" uuid REFERENCES "crm_automations"("id") ON DELETE set null,
  "automation_name" varchar(200),
  "lead_id" uuid REFERENCES "leads"("id") ON DELETE cascade,
  "trigger_kind" varchar(40) NOT NULL,
  "actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'ok' NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_automation_runs_tenant_idx" ON "crm_automation_runs" ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_automation_runs_lead_idx" ON "crm_automation_runs" ("lead_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_assignment_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" varchar(200) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "strategy" varchar(20) DEFAULT 'round_robin' NOT NULL,
  "conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "order_index" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_assignment_rules_tenant_idx" ON "crm_assignment_rules" ("tenant_id","order_index");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_sales_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "is_active" boolean DEFAULT true NOT NULL,
  "daily_capacity" integer DEFAULT 20 NOT NULL,
  "weight" integer DEFAULT 1 NOT NULL,
  "regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "industries" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "order_index" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_sales_settings_tenant_idx" ON "crm_sales_settings" ("tenant_id","order_index");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_sales_settings_user_uniq" ON "crm_sales_settings" ("tenant_id","user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_assignment_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "lead_id" uuid REFERENCES "leads"("id") ON DELETE cascade,
  "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "rule_id" uuid REFERENCES "crm_assignment_rules"("id") ON DELETE set null,
  "strategy" varchar(20),
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_assignment_log_tenant_idx" ON "crm_assignment_log" ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_assignment_log_lead_idx" ON "crm_assignment_log" ("lead_id");
