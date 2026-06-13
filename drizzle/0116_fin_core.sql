-- CORE-001: FinDesk workspace foundation
-- CORE: backlog/fin/FIN-CORE.md §1.1
-- Enums: fin_country, fin_vat_regime, fin_role, fin_doc_type, fin_onboarding_step
-- Tables: fin_org_profile, fin_invoice_series, fin_members, fin_onboarding
-- Migration: 0116 (max on main = 0114; 0115 on unmerged EFMD branch)

CREATE TYPE "public"."fin_country" AS ENUM('MD', 'RO');
--> statement-breakpoint
CREATE TYPE "public"."fin_vat_regime" AS ENUM('payer', 'non_payer');
--> statement-breakpoint
CREATE TYPE "public"."fin_role" AS ENUM('owner', 'accountant', 'cfo', 'viewer');
--> statement-breakpoint
CREATE TYPE "public"."fin_doc_type" AS ENUM('invoice', 'proforma', 'receipt');
--> statement-breakpoint
CREATE TYPE "public"."fin_onboarding_step" AS ENUM('company', 'parties', 'first_invoice', 'done');
--> statement-breakpoint
CREATE TABLE "fin_org_profile" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "legal_name" varchar(200) NOT NULL,
  "idno" varchar(30),
  "country" "fin_country" NOT NULL DEFAULT 'MD',
  "vat_regime" "fin_vat_regime" NOT NULL DEFAULT 'non_payer',
  "vat_number" varchar(30),
  "base_currency" varchar(3) NOT NULL DEFAULT 'MDL',
  "address" text,
  "logo_url" text,
  "fiscal_year_start" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fin_org_profile_tenant_uniq" UNIQUE ("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "fin_invoice_series" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "prefix" varchar(50) NOT NULL,
  "next_number" integer NOT NULL DEFAULT 1,
  "pad_width" integer NOT NULL DEFAULT 4,
  "doc_type" "fin_doc_type" NOT NULL DEFAULT 'invoice',
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "fin_role" NOT NULL DEFAULT 'viewer',
  "permissions" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fin_members_tenant_user_uniq" UNIQUE ("tenant_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE "fin_onboarding" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "step" "fin_onboarding_step" NOT NULL DEFAULT 'company',
  "completed_steps" jsonb DEFAULT '[]',
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fin_onboarding_tenant_uniq" UNIQUE ("tenant_id")
);
--> statement-breakpoint
CREATE INDEX "fin_org_profile_tenant_idx" ON "fin_org_profile" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "fin_invoice_series_tenant_idx" ON "fin_invoice_series" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "fin_members_tenant_idx" ON "fin_members" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "fin_members_user_idx" ON "fin_members" ("user_id");
--> statement-breakpoint
CREATE INDEX "fin_onboarding_tenant_idx" ON "fin_onboarding" ("tenant_id");
