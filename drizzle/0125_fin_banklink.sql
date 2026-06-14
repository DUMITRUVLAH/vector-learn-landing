-- BANKLINK-001: BankLink — fin_bank_connections + fin_bank_transactions
-- GAP-ANALYSIS G2: bank integration — import OFX/MT940 statements with deduplication

-- ── fin_bank_connections (Bank account connector per tenant) ──────────────────
CREATE TABLE IF NOT EXISTS "fin_bank_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bank_code" varchar(30),
	"account_iban" varchar(34),
	"currency" varchar(3) NOT NULL DEFAULT 'MDL',
	"import_format" varchar(20) NOT NULL DEFAULT 'OFX',
	"is_active" boolean NOT NULL DEFAULT true,
	"last_import_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fin_bank_connections"
  ADD CONSTRAINT "fbc_tenant_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fbc_tenant_idx" ON "fin_bank_connections" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fbc_tenant_active_idx" ON "fin_bank_connections" ("tenant_id", "is_active");
--> statement-breakpoint

-- ── fin_bank_transactions (Imported bank statement lines) ────────────────────
CREATE TABLE IF NOT EXISTS "fin_bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_connection_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"external_id" varchar(100) NOT NULL,
	"transaction_date" date NOT NULL,
	"value_date" date,
	"amount_cents" bigint NOT NULL,
	"currency" varchar(3) NOT NULL DEFAULT 'MDL',
	"description" text,
	"counterparty_name" text,
	"counterparty_iban" varchar(34),
	"reference" varchar(100),
	"status" varchar(20) NOT NULL DEFAULT 'unmatched',
	"matched_source_type" varchar(30),
	"matched_source_id" uuid,
	"imported_at" timestamp with time zone NOT NULL DEFAULT now(),
	"created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "fin_bank_transactions"
  ADD CONSTRAINT "fbt_connection_fk"
  FOREIGN KEY ("bank_connection_id") REFERENCES "public"."fin_bank_connections"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "fin_bank_transactions"
  ADD CONSTRAINT "fbt_tenant_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fbt_connection_external_id_uniq" ON "fin_bank_transactions" ("bank_connection_id", "external_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fbt_tenant_date_idx" ON "fin_bank_transactions" ("tenant_id", "transaction_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fbt_tenant_status_idx" ON "fin_bank_transactions" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fbt_connection_idx" ON "fin_bank_transactions" ("bank_connection_id");
