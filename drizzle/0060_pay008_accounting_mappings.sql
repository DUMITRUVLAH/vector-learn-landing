-- PAY-008: Accounting mappings — per-tenant config for transaction → account code
-- Migration 0036

-- 1. Create accounting_transaction_type enum
DO $$ BEGIN
  CREATE TYPE "accounting_transaction_type" AS ENUM ('payment', 'refund', 'payout');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create accounting_mappings table
CREATE TABLE IF NOT EXISTS "accounting_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "transaction_type" "accounting_transaction_type" NOT NULL,
  "account_code" varchar(30) NOT NULL,
  "description_template" text NOT NULL DEFAULT '{description}',
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. Create indexes
CREATE INDEX IF NOT EXISTS "accounting_mappings_tenant_idx" ON "accounting_mappings"("tenant_id");
CREATE INDEX IF NOT EXISTS "accounting_mappings_type_idx" ON "accounting_mappings"("tenant_id", "transaction_type");
