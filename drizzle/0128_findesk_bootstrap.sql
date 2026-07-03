-- ============================================================================
-- 0128_findesk_bootstrap.sql
-- Bootstrap ALL pre-existing FinDesk / ITPark tables that exist in prod Supabase
-- but have no CREATE migration in this repo (lost in the CRM→FinDesk split).
-- Every statement uses IF NOT EXISTS so this is a no-op on prod.
-- Also backfills missing columns on PAR and tenants tables.
-- ============================================================================

-- tenants.app_kind (SPLIT-003: which product this tenant belongs to)
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "app_kind" varchar(20) NOT NULL DEFAULT 'learn';
--> statement-breakpoint

-- ─── fin_org_profile ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_org_profile" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "legal_name" varchar(200) NOT NULL,
  "idno" varchar(30),
  "country" varchar(10) NOT NULL DEFAULT 'MD',
  "vat_regime" varchar(20) NOT NULL DEFAULT 'non_payer',
  "vat_number" varchar(30),
  "base_currency" varchar(3) NOT NULL DEFAULT 'MDL',
  "address" text,
  "logo_url" text,
  "fiscal_year_start" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_invoice_series ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_invoice_series" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "prefix" varchar(50) NOT NULL,
  "next_number" integer NOT NULL DEFAULT 1,
  "pad_width" integer NOT NULL DEFAULT 4,
  "doc_type" varchar(20) NOT NULL DEFAULT 'invoice',
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_members ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(20) NOT NULL DEFAULT 'viewer',
  "permissions" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_onboarding ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_onboarding" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "step" varchar(30) NOT NULL DEFAULT 'company',
  "completed_steps" jsonb DEFAULT '[]',
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_parties ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_parties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "kind" varchar(20) NOT NULL,
  "name" text NOT NULL,
  "country" char(2) NOT NULL,
  "idno" varchar(13),
  "vat_code" varchar(20),
  "iban" varchar(34),
  "address" text,
  "city" varchar(100),
  "postal_code" varchar(20),
  "email" varchar(254),
  "phone" varchar(30),
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_party_contacts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_party_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "party_id" uuid NOT NULL REFERENCES "fin_parties"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "role" varchar(100),
  "email" varchar(254),
  "phone" varchar(30),
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_agreements ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_agreements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "party_id" uuid,
  "title" text NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "start_date" date,
  "end_date" date,
  "currency" char(3) NOT NULL DEFAULT 'MDL',
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_agreement_services ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_agreement_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agreement_id" uuid NOT NULL REFERENCES "fin_agreements"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "billing_type" varchar(20) NOT NULL,
  "unit_price_cents" integer NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "vat_pct" integer NOT NULL DEFAULT 0,
  "recurrence_period" varchar(20),
  "next_bill_date" date,
  "last_billed_at" timestamp with time zone,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- fin_invoices columns missing from 0126 (which only did IF NOT EXISTS for the table itself)
ALTER TABLE "fin_invoices" ADD COLUMN IF NOT EXISTS "agreement_id" uuid;
--> statement-breakpoint
ALTER TABLE "fin_invoices" ADD COLUMN IF NOT EXISTS "series" varchar(20) NOT NULL DEFAULT 'FIN';
--> statement-breakpoint
ALTER TABLE "fin_invoices" ADD COLUMN IF NOT EXISTS "due_date" date;
--> statement-breakpoint
ALTER TABLE "fin_invoices" ADD COLUMN IF NOT EXISTS "vat_total_cents" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- ─── fin_invoice_lines ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_invoice_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL REFERENCES "fin_invoices"("id") ON DELETE CASCADE,
  "service_id" uuid,
  "description" text NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "unit_price_cents" integer NOT NULL,
  "vat_pct" integer NOT NULL DEFAULT 0,
  "line_total_cents" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_invoice_reminders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_invoice_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "fin_invoices"("id") ON DELETE CASCADE,
  "reminder_day" integer NOT NULL,
  "channel" varchar(20) NOT NULL DEFAULT 'email',
  "status" varchar(20) NOT NULL DEFAULT 'sent',
  "body" varchar(2000),
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_expenses ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "category" varchar(50) NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'MDL',
  "vat_deductible" boolean NOT NULL,
  "vat_amount_cents" integer NOT NULL DEFAULT 0,
  "source" varchar(20) NOT NULL DEFAULT 'manual',
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "description" text,
  "reference" varchar(100),
  "vendor_name" varchar(200),
  "expense_date" date NOT NULL,
  "paid_at" timestamp with time zone,
  "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approved_at" timestamp with time zone,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "import_hash" varchar(64),
  "par_request_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_expense_attachments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_expense_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "expense_id" uuid NOT NULL REFERENCES "fin_expenses"("id") ON DELETE CASCADE,
  "file_key" varchar(500) NOT NULL,
  "file_name" varchar(255) NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "size_bytes" integer NOT NULL,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_ledger_accounts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_ledger_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" varchar(20) NOT NULL,
  "name" text NOT NULL,
  "account_class" varchar(1) NOT NULL,
  "parent_code" varchar(20),
  "is_system" boolean NOT NULL DEFAULT true,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_journal_entries ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_journal_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entry_date" date NOT NULL,
  "description" text,
  "reference" varchar(100),
  "source_type" varchar(30) NOT NULL DEFAULT 'MANUAL',
  "source_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'posted',
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_journal_lines ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_journal_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "entry_id" uuid NOT NULL REFERENCES "fin_journal_entries"("id") ON DELETE CASCADE,
  "account_code" varchar(20) NOT NULL,
  "debit_cents" bigint NOT NULL DEFAULT 0,
  "credit_cents" bigint NOT NULL DEFAULT 0,
  "currency" varchar(3) NOT NULL DEFAULT 'MDL',
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_ledger_entries ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entry_type" varchar(40) NOT NULL,
  "entry_date" date NOT NULL,
  "period_month" varchar(7),
  "account_code" varchar(20),
  "debit_cents" bigint NOT NULL DEFAULT 0,
  "credit_cents" bigint NOT NULL DEFAULT 0,
  "fx_gain_loss_cents" bigint DEFAULT 0,
  "description" text,
  "ref" varchar(100),
  "posted_at" timestamp with time zone DEFAULT now(),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_budgets ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "fiscal_year" integer NOT NULL,
  "department" varchar(100),
  "branch_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "notes" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_budget_lines ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_budget_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "budget_id" uuid NOT NULL REFERENCES "fin_budgets"("id") ON DELETE CASCADE,
  "category" varchar(50) NOT NULL,
  "label" varchar(200) NOT NULL,
  "budgeted_cents" bigint NOT NULL DEFAULT 0,
  "display_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_bank_transactions (from finCash.ts — CASH module) ───────────────────
-- Note: finBankLink.ts is skipped in index.ts; this creates the CASH version.
CREATE TABLE IF NOT EXISTS "fin_bank_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_label" varchar(200) NOT NULL,
  "tx_date" date NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'MDL',
  "reference" varchar(500),
  "counterparty" varchar(500),
  "direction" varchar(5) NOT NULL,
  "import_batch_id" uuid NOT NULL,
  "match_status" varchar(20) NOT NULL DEFAULT 'unmatched',
  "match_score_bp" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_payments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "party_id" uuid,
  "received_date" date NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'MDL',
  "account_label" varchar(200),
  "allocated_cents" integer NOT NULL DEFAULT 0,
  "bank_tx_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_payment_allocations ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_payment_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "payment_id" uuid NOT NULL REFERENCES "fin_payments"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL,
  "amount_cents" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_bulk_jobs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_bulk_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "job_type" varchar(50) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "total_rows" integer NOT NULL DEFAULT 0,
  "success_rows" integer NOT NULL DEFAULT 0,
  "fail_rows" integer NOT NULL DEFAULT 0,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "error_message" text,
  "meta" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_bulk_rows ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_bulk_rows" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL REFERENCES "fin_bulk_jobs"("id") ON DELETE CASCADE,
  "row_index" integer NOT NULL,
  "external_ref" varchar(200),
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "retry_count" integer NOT NULL DEFAULT 0,
  "error_message" text,
  "result_ref" varchar(200),
  "processed_at" timestamp with time zone,
  "meta" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_inventory_items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_inventory_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "sku" varchar(50),
  "unit" varchar(20) NOT NULL DEFAULT 'buc',
  "description" text,
  "qty_on_hand" bigint NOT NULL DEFAULT 0,
  "avg_cost_cents" bigint NOT NULL DEFAULT 0,
  "min_qty_alert" bigint DEFAULT 0,
  "category" varchar(50),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_stock_movements ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "fin_inventory_items"("id") ON DELETE RESTRICT,
  "movement_type" varchar(30) NOT NULL,
  "qty" bigint NOT NULL,
  "unit_cost_cents" bigint NOT NULL DEFAULT 0,
  "total_cost_cents" bigint NOT NULL DEFAULT 0,
  "invoice_id" uuid,
  "reference" varchar(100),
  "notes" text,
  "branch_id" uuid,
  "moved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "spend_id" uuid,
  "moved_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_assets ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "category" varchar(100),
  "acquisition_date" date NOT NULL,
  "acquisition_cost_cents" integer NOT NULL DEFAULT 0,
  "residual_value_cents" integer NOT NULL DEFAULT 0,
  "useful_life_months" integer NOT NULL DEFAULT 36,
  "depreciation_method" varchar(20) NOT NULL DEFAULT 'linear',
  "status" varchar(25) NOT NULL DEFAULT 'active',
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_depreciation_entries ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_depreciation_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "asset_id" uuid NOT NULL REFERENCES "fin_assets"("id") ON DELETE CASCADE,
  "period_month" varchar(7) NOT NULL,
  "depreciation_cents" integer NOT NULL DEFAULT 0,
  "book_value_cents" integer NOT NULL DEFAULT 0,
  "expense_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_employees ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "full_name" varchar(255) NOT NULL,
  "job_title" varchar(255),
  "contract_type" varchar(20) NOT NULL DEFAULT 'employee',
  "base_salary_cents" integer NOT NULL DEFAULT 0,
  "currency" varchar(3) NOT NULL DEFAULT 'MDL',
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_payroll_runs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_payroll_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "period_month" varchar(7) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "confirmed_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_payroll_items ───────────────────────────────────────────────────────
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

-- ─── fin_tax_periods ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_tax_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "period_type" varchar(20) NOT NULL,
  "year" integer NOT NULL,
  "month" integer,
  "quarter" integer,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'open',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_tax_declarations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_tax_declarations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "period_id" uuid NOT NULL REFERENCES "fin_tax_periods"("id") ON DELETE CASCADE,
  "declaration_type" varchar(20) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "filed_at" timestamp with time zone,
  "notes" text,
  "payload" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_obligations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_obligations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "obligation_type" varchar(50) NOT NULL,
  "description" varchar(500),
  "period_year" integer NOT NULL,
  "period_month" integer NOT NULL,
  "due_date" date NOT NULL,
  "amount_cents" bigint NOT NULL DEFAULT 0,
  "currency" char(3) NOT NULL DEFAULT 'MDL',
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "paid_at" timestamp with time zone,
  "declaration_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_period_locks ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_period_locks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "period_year" integer NOT NULL,
  "period_month" integer NOT NULL,
  "locked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "notes" text
);
--> statement-breakpoint

-- ─── fin_tax_rates ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_tax_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid,
  "country" char(2) NOT NULL,
  "kind" varchar(30) NOT NULL,
  "name" text NOT NULL,
  "rate_pct" numeric(6,4) NOT NULL,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "is_default" boolean NOT NULL DEFAULT false,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_chart_of_accounts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_chart_of_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid,
  "country" char(2) NOT NULL,
  "account_code" text NOT NULL,
  "account_name" text NOT NULL,
  "account_type" varchar(20) NOT NULL,
  "parent_code" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_exchange_rates ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_exchange_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "currency_from" varchar(3) NOT NULL,
  "currency_to" varchar(3) NOT NULL,
  "rate" numeric(18,6) NOT NULL,
  "rate_date" date NOT NULL,
  "source" varchar(20) NOT NULL DEFAULT 'BNM',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_saved_views ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_saved_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "metric" varchar(20) NOT NULL,
  "period" varchar(20) NOT NULL DEFAULT 'this_month',
  "group_by" varchar(20) NOT NULL DEFAULT 'month',
  "filters" jsonb NOT NULL DEFAULT '{}',
  "is_default" boolean NOT NULL DEFAULT false,
  "is_public" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_narratives ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_narratives" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "author_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "month" varchar(7) NOT NULL,
  "title" varchar(300) NOT NULL,
  "body" text NOT NULL,
  "generated_by" varchar(10) NOT NULL DEFAULT 'manual',
  "sentiment" varchar(10) NOT NULL DEFAULT 'neutral',
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_data_settings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_data_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "pseudonymize_ai_prompts" boolean NOT NULL DEFAULT true,
  "ai_log_retention_days" integer NOT NULL DEFAULT 90,
  "ai_opt_in" boolean NOT NULL DEFAULT false,
  "retention_days_students" integer NOT NULL DEFAULT 1825,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_client_portal_tokens ────────────────────────────────────────────────
-- Note: depends on company_clients and students which are created in earlier migrations.
CREATE TABLE IF NOT EXISTS "fin_client_portal_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" uuid REFERENCES "company_clients"("id") ON DELETE CASCADE,
  "contact_id" uuid REFERENCES "students"("id") ON DELETE CASCADE,
  "token" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "last_used_at" timestamp with time zone,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_client_portal_documents ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_client_portal_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "portal_token_id" uuid NOT NULL REFERENCES "fin_client_portal_tokens"("id") ON DELETE CASCADE,
  "original_name" varchar(500) NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "size_bytes" integer NOT NULL,
  "storage_path" text NOT NULL,
  "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── itpark_engagements ──────────────────────────────────────────────────────
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
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "subcontractor_costs_cents" bigint NOT NULL DEFAULT 0,
  "subcontractor_costs_pct" numeric(5,2),
  "total_sales_cents" bigint,
  "adjusted_revenue_cents" bigint NOT NULL DEFAULT 0,
  "employee_info_procedure" text,
  "fin_party_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── itpark_revenue_lines ────────────────────────────────────────────────────
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
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── itpark_caem_codes ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "itpark_caem_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" varchar(20) NOT NULL,
  "label" varchar(500) NOT NULL,
  "eligible" boolean NOT NULL DEFAULT false,
  "effective_from" date NOT NULL,
  "country" varchar(5) NOT NULL DEFAULT 'MD',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── itpark_monthly ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "itpark_monthly" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "engagement_id" uuid NOT NULL REFERENCES "itpark_engagements"("id") ON DELETE CASCADE,
  "month" integer NOT NULL,
  "eligible_cents" bigint NOT NULL DEFAULT 0,
  "total_cents" bigint NOT NULL DEFAULT 0,
  "cumulative_eligible_cents" bigint NOT NULL DEFAULT 0,
  "cumulative_total_cents" bigint NOT NULL DEFAULT 0,
  "monthly_share_pct" numeric(5,2) NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── itpark_packet_documents ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "itpark_packet_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "engagement_id" uuid NOT NULL REFERENCES "itpark_engagements"("id") ON DELETE CASCADE,
  "kind" varchar(30) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "data_json" jsonb,
  "generated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── itpark_settings ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "itpark_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "eligibility_threshold_pct" numeric(5,2) NOT NULL DEFAULT '70.00',
  "tolerance_months" integer NOT NULL DEFAULT 2,
  "default_currency" varchar(10) NOT NULL DEFAULT 'MDL',
  "default_audit_firm" varchar(255),
  "auditor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── itpark_audit ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "itpark_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "engagement_id" uuid REFERENCES "itpark_engagements"("id") ON DELETE CASCADE,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "action" varchar(100) NOT NULL,
  "entity_type" varchar(100),
  "entity_id" uuid,
  "meta" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_vat_import_companies ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_vat_import_companies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "idno" varchar(20),
  "vat_rate_bp" integer NOT NULL DEFAULT 2000,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ─── fin_captures missing columns ────────────────────────────────────────────
-- confirmed_by / confirmed_at were in finCaptures.ts but omitted from 0117
ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "confirmed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "confirmed_at" timestamp with time zone;
--> statement-breakpoint

-- fin_capture_lines: match columns added in STMT module
ALTER TABLE "fin_capture_lines" ADD COLUMN IF NOT EXISTS "match_status" varchar(10) NOT NULL DEFAULT 'review';
--> statement-breakpoint
ALTER TABLE "fin_capture_lines" ADD COLUMN IF NOT EXISTS "matched_capture_id" uuid REFERENCES "fin_captures"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "fin_capture_lines" ADD COLUMN IF NOT EXISTS "match_score_bp" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "fin_capture_lines" ADD COLUMN IF NOT EXISTS "linked_fin_invoice_id" uuid REFERENCES "fin_invoices"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- ─── PAR missing columns ─────────────────────────────────────────────────────
-- par_budget_codes.allocated_cents
ALTER TABLE "par_budget_codes" ADD COLUMN IF NOT EXISTS "allocated_cents" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- par_vendors compliance columns (Feature 1: contafirm.md)
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "kind" varchar(20) NOT NULL DEFAULT 'individual';
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "company_status" varchar(100);
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "registry_id" integer;
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "verified_at" timestamp with time zone;
--> statement-breakpoint
-- par_settings onboarding + 3-way match columns
ALTER TABLE "par_settings" ADD COLUMN IF NOT EXISTS "onboarding_complete" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "par_settings" ADD COLUMN IF NOT EXISTS "enforce_three_way_match" boolean NOT NULL DEFAULT false;
