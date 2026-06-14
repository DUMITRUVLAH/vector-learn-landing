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
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fle_tenant_idx" ON "fin_ledger_entries" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fle_tenant_period_idx" ON "fin_ledger_entries" ("tenant_id", "period_month");
