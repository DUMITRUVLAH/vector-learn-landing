-- PAY-001 (FIN): FinDesk Payroll — fin_employees + fin_payroll_runs + fin_payroll_items
-- Migration: 0115_fin_payroll
-- Branch: feat/FIN-pay (based on origin/main at idx 114)

-- Enum: tipul contractului angajatului
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_employee_contract_type') THEN
    CREATE TYPE fin_employee_contract_type AS ENUM ('employee', 'contractor');
  END IF;
END $$;
--> statement-breakpoint

-- Enum: statusul angajatului
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_employee_status') THEN
    CREATE TYPE fin_employee_status AS ENUM ('active', 'inactive');
  END IF;
END $$;
--> statement-breakpoint

-- Enum: statusul rulajului de salarizare
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fin_payroll_run_status') THEN
    CREATE TYPE fin_payroll_run_status AS ENUM ('draft', 'confirmed', 'paid');
  END IF;
END $$;
--> statement-breakpoint

-- Tabela angajați
CREATE TABLE IF NOT EXISTS "fin_employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "full_name" varchar(255) NOT NULL,
  "job_title" varchar(255),
  "contract_type" fin_employee_contract_type NOT NULL DEFAULT 'employee',
  "base_salary_cents" integer NOT NULL DEFAULT 0,
  "currency" varchar(3) NOT NULL DEFAULT 'MDL',
  "status" fin_employee_status NOT NULL DEFAULT 'active',
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fin_employees_tenant_idx" ON "fin_employees" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_employees_tenant_status_idx" ON "fin_employees" ("tenant_id", "status");
--> statement-breakpoint

-- Tabela rulaje salarizare
CREATE TABLE IF NOT EXISTS "fin_payroll_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "period_month" varchar(7) NOT NULL,
  "status" fin_payroll_run_status NOT NULL DEFAULT 'draft',
  "confirmed_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fin_payroll_runs_tenant_idx" ON "fin_payroll_runs" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_payroll_runs_tenant_month_idx" ON "fin_payroll_runs" ("tenant_id", "period_month");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_payroll_runs_tenant_status_idx" ON "fin_payroll_runs" ("tenant_id", "status");
--> statement-breakpoint

-- Tabela linii calcul salariu
CREATE TABLE IF NOT EXISTS "fin_payroll_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "run_id" uuid NOT NULL REFERENCES "fin_payroll_runs"("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL REFERENCES "fin_employees"("id") ON DELETE RESTRICT,
  "gross_cents" integer NOT NULL DEFAULT 0,
  "deductions_jsonb" jsonb NOT NULL DEFAULT '{}',
  "net_cents" integer NOT NULL DEFAULT 0,
  "employer_cost_cents" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fin_payroll_items_tenant_idx" ON "fin_payroll_items" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_payroll_items_run_idx" ON "fin_payroll_items" ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_payroll_items_employee_idx" ON "fin_payroll_items" ("employee_id");
