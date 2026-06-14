-- MULTICURRENCY-001: BNM daily exchange rates
-- Stores per-tenant currency pair rates for MDL revaluation foundation

CREATE TABLE IF NOT EXISTS "fin_exchange_rates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "currency_from" varchar(3) NOT NULL,
  "currency_to" varchar(3) NOT NULL,
  "rate" numeric(18, 6) NOT NULL,
  "rate_date" date NOT NULL,
  "source" varchar(20) NOT NULL DEFAULT 'BNM',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fin_exchange_rates_pair_date_idx"
  ON "fin_exchange_rates" ("tenant_id", "currency_from", "currency_to", "rate_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_exchange_rates_tenant_idx"
  ON "fin_exchange_rates" ("tenant_id");
