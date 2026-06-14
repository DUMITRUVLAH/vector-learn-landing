-- LEDGER-001: General Ledger — double-entry accounting for FinDesk
-- Tables: fin_ledger_accounts, fin_journal_entries, fin_journal_lines
-- GAP-ANALYSIS G1: real double-entry accounting — #1 competitive differentiator

-- ── fin_ledger_accounts (Chart of accounts) ────────────────────────────────
CREATE TABLE IF NOT EXISTS "fin_ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" text NOT NULL,
	"account_class" varchar(1) NOT NULL,
	"parent_code" varchar(20),
	"is_system" boolean NOT NULL DEFAULT true,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fin_ledger_accounts"
  ADD CONSTRAINT "fla_tenant_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fla_tenant_code_uniq" ON "fin_ledger_accounts" ("tenant_id", "code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fla_tenant_idx" ON "fin_ledger_accounts" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fla_class_idx" ON "fin_ledger_accounts" ("tenant_id", "account_class");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fla_active_idx" ON "fin_ledger_accounts" ("tenant_id", "is_active");
--> statement-breakpoint

-- ── fin_journal_entries (Journal entry headers) ────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fin_journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"description" text,
	"reference" varchar(100),
	"source_type" varchar(30) NOT NULL DEFAULT 'MANUAL',
	"source_id" uuid,
	"status" varchar(20) NOT NULL DEFAULT 'posted',
	"created_by" uuid,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fin_journal_entries"
  ADD CONSTRAINT "fje_tenant_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fin_journal_entries"
  ADD CONSTRAINT "fje_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fje_tenant_idx" ON "fin_journal_entries" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fje_tenant_date_idx" ON "fin_journal_entries" ("tenant_id", "entry_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fje_source_idx" ON "fin_journal_entries" ("tenant_id", "source_type", "source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fje_status_idx" ON "fin_journal_entries" ("tenant_id", "status");
--> statement-breakpoint

-- ── fin_journal_lines (Debit/credit pairs) ─────────────────────────────────
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fin_journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_code" varchar(20) NOT NULL,
	"debit_cents" bigint NOT NULL DEFAULT 0,
	"credit_cents" bigint NOT NULL DEFAULT 0,
	"currency" varchar(3) NOT NULL DEFAULT 'MDL',
	"description" text,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "fjl_debit_xor_credit" CHECK (debit_cents = 0 OR credit_cents = 0)
);
--> statement-breakpoint
ALTER TABLE "fin_journal_lines"
  ADD CONSTRAINT "fjl_entry_fk"
  FOREIGN KEY ("entry_id") REFERENCES "public"."fin_journal_entries"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fjl_entry_idx" ON "fin_journal_lines" ("entry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fjl_account_idx" ON "fin_journal_lines" ("account_code");
