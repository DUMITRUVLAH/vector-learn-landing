-- ASSET-001 (FIN): FinDesk — Active Fixe
-- Schema: fin_assets + fin_depreciation_entries
-- Migration: 0115_fin_assets.sql
-- Branch: feat/FIN-asset (from main, idx 114)
-- NOTE: feat/FIN-pay also adds 0115_fin_payroll.sql — renumber at merge.

--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "fin_depreciation_method" AS ENUM ('linear', 'declining_balance');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "fin_asset_status" AS ENUM ('active', 'fully_depreciated', 'sold', 'scrapped');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fin_assets" (
  "id"                      uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"               uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name"                    varchar(255) NOT NULL,
  "description"             text,
  "category"                varchar(100),
  "acquisition_date"        date NOT NULL,
  "acquisition_cost_cents"  integer NOT NULL DEFAULT 0,
  "residual_value_cents"    integer NOT NULL DEFAULT 0,
  "useful_life_months"      integer NOT NULL DEFAULT 36,
  "depreciation_method"     "fin_depreciation_method" NOT NULL DEFAULT 'linear',
  "status"                  "fin_asset_status" NOT NULL DEFAULT 'active',
  "notes"                   text,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fin_depreciation_entries" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id"           uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "asset_id"            uuid NOT NULL REFERENCES "fin_assets"("id") ON DELETE CASCADE,
  "period_month"        varchar(7) NOT NULL,
  "depreciation_cents"  integer NOT NULL DEFAULT 0,
  "book_value_cents"    integer NOT NULL DEFAULT 0,
  "expense_id"          uuid,
  "notes"               text,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "fin_depr_entries_asset_month_unique" UNIQUE ("asset_id", "period_month")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_assets_tenant_idx"
  ON "fin_assets" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_assets_tenant_status_idx"
  ON "fin_assets" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_assets_tenant_category_idx"
  ON "fin_assets" ("tenant_id", "category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_depr_entries_tenant_idx"
  ON "fin_depreciation_entries" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_depr_entries_asset_idx"
  ON "fin_depreciation_entries" ("asset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_depr_entries_asset_month_idx"
  ON "fin_depreciation_entries" ("asset_id", "period_month");
