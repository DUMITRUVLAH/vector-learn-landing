-- CRM Faza 4: baza unică de firme + jurnalul importurilor.
-- `leads.company` (text) rămâne neatins — e afișarea de rezervă pentru
-- lead-urile existente; legătura nouă se face prin `leads.company_id`.
CREATE TABLE IF NOT EXISTS "crm_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"name" varchar(300) NOT NULL,
	"name_normalized" varchar(300),
	"idno" varchar(40),
	"industry" varchar(120),
	"region" varchar(120),
	"company_size" varchar(40),
	"annual_consumption_kwh" numeric,
	"website" varchar(300),
	"phone" varchar(32),
	"phone_normalized" varchar(32),
	"email" varchar(255),
	"email_normalized" varchar(255),
	"address" varchar(500),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_companies_tenant_idx" ON "crm_companies" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_companies_name_idx" ON "crm_companies" ("tenant_id","name_normalized");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_companies_phone_idx" ON "crm_companies" ("tenant_id","phone_normalized");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_companies_email_idx" ON "crm_companies" ("tenant_id","email_normalized");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_companies_idno_idx" ON "crm_companies" ("tenant_id","idno");
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "company_id" uuid REFERENCES "crm_companies"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_company_idx" ON "leads" ("tenant_id","company_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"file_name" varchar(300),
	"source" varchar(40) DEFAULT 'file' NOT NULL,
	"mapping" jsonb,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb,
	"created_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_import_jobs_tenant_idx" ON "crm_import_jobs" ("tenant_id","created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_import_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"name" varchar(200) NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_import_mappings_tenant_idx" ON "crm_import_mappings" ("tenant_id","name");
