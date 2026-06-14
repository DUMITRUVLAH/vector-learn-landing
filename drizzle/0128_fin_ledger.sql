-- MULTICURRENCY-002: FIN General Ledger entries
-- Stores month-close FX revaluation differences posted after BNM rate comparison

CREATE TABLE IF NOT EXISTS "fin_ledger_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entry_type" varchar(30) NOT NULL,
  "currency_from" varchar(3) NOT NULL,
  "currency_to" varchar(3) NOT NULL,
  "amount_cents" bigint NOT NULL,
  "rate_used" numeric(18, 6) NOT NULL,
  "fx_gain_loss_cents" bigint NOT NULL DEFAULT 0,
  "reference_id" uuid,
  "period_month" date NOT NULL,
  "posted_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "posted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "note" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_ledger_tenant_idx"
  ON "fin_ledger_entries" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_ledger_period_idx"
  ON "fin_ledger_entries" ("tenant_id", "period_month");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_ledger_entry_type_idx"
  ON "fin_ledger_entries" ("tenant_id", "entry_type");
