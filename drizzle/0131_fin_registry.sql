-- REGISTRY-001: FinDesk tax rates + chart of accounts
-- Adds: fin_tax_kind enum, fin_account_type enum, fin_tax_rates table, fin_chart_of_accounts table
-- tenantId nullable: NULL = global seed data for that country.

DO $$ BEGIN
  CREATE TYPE "fin_tax_kind" AS ENUM ('vat', 'income_tax', 'social_contribution', 'dividend_tax', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "fin_account_type" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense', 'cost_of_goods', 'tax');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fin_tax_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid,
  "country" char(2) NOT NULL,
  "kind" "fin_tax_kind" NOT NULL,
  "name" text NOT NULL,
  "rate_pct" numeric(6, 4) NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "is_default" boolean NOT NULL DEFAULT false,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fin_chart_of_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid,
  "country" char(2) NOT NULL,
  "account_code" text NOT NULL,
  "account_name" text NOT NULL,
  "account_type" "fin_account_type" NOT NULL,
  "parent_code" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fin_tax_rates_tenant_country_idx" ON "fin_tax_rates" ("tenant_id", "country");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fin_tax_rates_country_kind_idx" ON "fin_tax_rates" ("country", "kind");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fin_chart_tenant_country_idx" ON "fin_chart_of_accounts" ("tenant_id", "country");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "fin_chart_tenant_code_uniq" ON "fin_chart_of_accounts" ("tenant_id", "account_code", "country");
