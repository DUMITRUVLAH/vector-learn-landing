-- CRM Faza 9 — cadențe (secvențe de urmărire) + reactivarea clienților pierduți.
--
-- Reactivarea cere un declanșator PE TIMP („au trecut 6 luni de la pierdere"), pe care motorul de
-- automatizări nu-l are (acolo există doar `lead.created` și `lead.stage_changed`). Livrarea
-- pentru acțiunea „înscrie în cadență" refolosește însă cadențele — motorul lor de pași există.

CREATE TABLE IF NOT EXISTS "crm_cadences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" varchar(200) NOT NULL,
  "trigger_stage" varchar(64),
  "enabled" boolean DEFAULT true NOT NULL,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_cadences_tenant_idx" ON "crm_cadences" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_cadence_enrollments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "cadence_id" uuid NOT NULL REFERENCES "crm_cadences"("id") ON DELETE cascade,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "current_step" integer DEFAULT 0 NOT NULL,
  "next_fire_at" timestamp with time zone,
  "enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_enrollments_lead_idx" ON "crm_cadence_enrollments" ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_enrollments_due_idx" ON "crm_cadence_enrollments" ("tenant_id","status","next_fire_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_reengagement_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" varchar(200) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "after_months" integer DEFAULT 6 NOT NULL,
  "lost_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "stage_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "action" varchar(30) DEFAULT 'create_task' NOT NULL,
  "cadence_id" uuid REFERENCES "crm_cadences"("id") ON DELETE set null,
  "task_title" varchar(300),
  "order_index" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_reeng_rules_tenant_idx" ON "crm_reengagement_rules" ("tenant_id","order_index");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_reengagement_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "rule_id" uuid NOT NULL REFERENCES "crm_reengagement_rules"("id") ON DELETE cascade,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "ran_at" timestamp with time zone DEFAULT now() NOT NULL,
  "result" varchar(20) DEFAULT 'ok' NOT NULL,
  CONSTRAINT "crm_reeng_runs_rule_lead_uniq" UNIQUE("rule_id","lead_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_reeng_runs_tenant_idx" ON "crm_reengagement_runs" ("tenant_id","ran_at");
