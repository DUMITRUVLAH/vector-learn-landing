-- SPLIT-201: ITPark schema — CREATE TABLE IF NOT EXISTS (idempotent; tables may already exist on prod)
-- Creates all itpark_* tables needed for the ITPark Audit Toolkit module.
-- Missing from migration history despite schema existing in code.

DO $$ BEGIN
  CREATE TYPE "public"."itpark_engagement_status" AS ENUM('draft', 'in_progress', 'ready', 'exported');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."itpark_packet_kind" AS ENUM(
    'anexa2', 'anexa3', 'anexa4',
    'letter_solvency', 'letter_address', 'letter_no_subdivisions',
    'letter_activity', 'letter_no_adjustments', 'decl_self_responsibility'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."itpark_doc_status" AS ENUM('draft', 'ready', 'exported');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "itpark_engagements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "resident_name" varchar(255) NOT NULL,
  "idno" varchar(20) NOT NULL,
  "mitp_contract_no" varchar(50),
  "mitp_contract_date" date,
  "legal_address" text,
  "subdivision_addresses" text,
  "vat_payer" boolean NOT NULL DEFAULT false,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "reporting_year" integer NOT NULL,
  "audit_firm_name" varchar(255),
  "status" "itpark_engagement_status" NOT NULL DEFAULT 'draft',
  "subcontractor_costs_cents" bigint NOT NULL DEFAULT 0,
  "subcontractor_costs_pct" numeric(5, 2),
  "total_sales_cents" bigint,
  "adjusted_revenue_cents" bigint NOT NULL DEFAULT 0,
  "employee_info_procedure" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_eng_tenant_idx" ON "itpark_engagements" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_eng_year_idx" ON "itpark_engagements" ("tenant_id", "reporting_year");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_eng_idno_idx" ON "itpark_engagements" ("tenant_id", "idno");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "itpark_revenue_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "engagement_id" uuid NOT NULL REFERENCES "itpark_engagements"("id") ON DELETE CASCADE,
  "row_no" integer NOT NULL DEFAULT 0,
  "client_name" varchar(255) NOT NULL,
  "document_refs" text,
  "service_description" text NOT NULL DEFAULT '',
  "caem_code" varchar(20) NOT NULL,
  "amount_cents" bigint NOT NULL,
  "is_eligible" boolean NOT NULL DEFAULT false,
  "month" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_rl_tenant_idx" ON "itpark_revenue_lines" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_rl_engagement_idx" ON "itpark_revenue_lines" ("engagement_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_rl_caem_idx" ON "itpark_revenue_lines" ("caem_code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_rl_month_idx" ON "itpark_revenue_lines" ("engagement_id", "month");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "itpark_caem_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(20) NOT NULL,
  "label" varchar(500) NOT NULL,
  "eligible" boolean NOT NULL DEFAULT false,
  "effective_from" date NOT NULL,
  "country" varchar(5) NOT NULL DEFAULT 'MD',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_caem_code_idx" ON "itpark_caem_codes" ("code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_caem_eligible_idx" ON "itpark_caem_codes" ("eligible");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_caem_effective_idx" ON "itpark_caem_codes" ("effective_from");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "itpark_monthly" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "engagement_id" uuid NOT NULL REFERENCES "itpark_engagements"("id") ON DELETE CASCADE,
  "month" integer NOT NULL,
  "eligible_cents" bigint NOT NULL DEFAULT 0,
  "total_cents" bigint NOT NULL DEFAULT 0,
  "cumulative_eligible_cents" bigint NOT NULL DEFAULT 0,
  "cumulative_total_cents" bigint NOT NULL DEFAULT 0,
  "monthly_share_pct" numeric(5, 2) NOT NULL DEFAULT '0',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_monthly_tenant_idx" ON "itpark_monthly" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_monthly_engagement_idx" ON "itpark_monthly" ("engagement_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_monthly_month_idx" ON "itpark_monthly" ("engagement_id", "month");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "itpark_packet_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "engagement_id" uuid NOT NULL REFERENCES "itpark_engagements"("id") ON DELETE CASCADE,
  "kind" "itpark_packet_kind" NOT NULL,
  "status" "itpark_doc_status" NOT NULL DEFAULT 'draft',
  "data_json" jsonb,
  "generated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_pd_tenant_idx" ON "itpark_packet_documents" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_pd_engagement_idx" ON "itpark_packet_documents" ("engagement_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_pd_kind_idx" ON "itpark_packet_documents" ("engagement_id", "kind");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "itpark_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "eligibility_threshold_pct" numeric(5, 2) NOT NULL DEFAULT '70.00',
  "tolerance_months" integer NOT NULL DEFAULT 2,
  "default_currency" varchar(10) NOT NULL DEFAULT 'MDL',
  "default_audit_firm" varchar(255),
  "auditor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_settings_tenant_idx" ON "itpark_settings" ("tenant_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "itpark_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "engagement_id" uuid REFERENCES "itpark_engagements"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" varchar(100) NOT NULL,
  "entity_type" varchar(100),
  "entity_id" uuid,
  "meta" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_audit_tenant_idx" ON "itpark_audit" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "itpark_audit_engagement_idx" ON "itpark_audit" ("engagement_id");
