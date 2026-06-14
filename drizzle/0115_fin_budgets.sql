-- BUDGET-001: FinDesk — Bugete financiare
-- Tables: fin_budgets, fin_budget_lines
-- Drizzle migration idx 115

DO $$ BEGIN
  CREATE TYPE "public"."fin_budget_status" AS ENUM('draft', 'active', 'closed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fin_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" varchar(200) NOT NULL,
  "fiscal_year" integer NOT NULL,
  "department" varchar(100),
  "branch_id" uuid,
  "status" "fin_budget_status" DEFAULT 'draft' NOT NULL,
  "notes" text,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "fin_budget_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "budget_id" uuid NOT NULL,
  "category" varchar(50) NOT NULL,
  "label" varchar(200) NOT NULL,
  "budgeted_cents" bigint DEFAULT 0 NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "fin_budgets" ADD CONSTRAINT "fin_budgets_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "fin_budgets" ADD CONSTRAINT "fin_budgets_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "fin_budget_lines" ADD CONSTRAINT "fin_budget_lines_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "fin_budget_lines" ADD CONSTRAINT "fin_budget_lines_budget_id_fin_budgets_id_fk"
    FOREIGN KEY ("budget_id") REFERENCES "public"."fin_budgets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fin_budgets_tenant_idx" ON "fin_budgets" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_budgets_tenant_year_idx" ON "fin_budgets" USING btree ("tenant_id","fiscal_year");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_budgets_tenant_status_idx" ON "fin_budgets" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_budget_lines_budget_idx" ON "fin_budget_lines" USING btree ("budget_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_budget_lines_tenant_idx" ON "fin_budget_lines" USING btree ("tenant_id");
