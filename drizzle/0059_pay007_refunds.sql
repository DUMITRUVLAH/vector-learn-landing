-- PAY-007: Refunds — partial/full invoice refunds + Stripe refund integration
-- Migration 0035

-- 1. Add new values to invoice_status enum
-- PostgreSQL requires IF NOT EXISTS to be idempotent (PG 9.6+)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'refunded' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'invoice_status')) THEN
    ALTER TYPE "invoice_status" ADD VALUE 'refunded';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'partially_refunded' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'invoice_status')) THEN
    ALTER TYPE "invoice_status" ADD VALUE 'partially_refunded';
  END IF;
END$$;

-- 2. Add refunded_amount_cents column to invoices
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "refunded_amount_cents" integer NOT NULL DEFAULT 0;

-- 3. Create refund_status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_status') THEN
    CREATE TYPE "refund_status" AS ENUM ('pending', 'completed', 'failed');
  END IF;
END$$;

-- 4. Create refund_method enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_method') THEN
    CREATE TYPE "refund_method" AS ENUM ('stripe', 'manual');
  END IF;
END$$;

-- 5. Create refunds table
CREATE TABLE IF NOT EXISTS "refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'RON',
  "reason" text NOT NULL,
  "method" "refund_method" NOT NULL DEFAULT 'manual',
  "stripe_refund_id" varchar(100),
  "processed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "processed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" "refund_status" NOT NULL DEFAULT 'completed',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS "refunds_tenant_idx" ON "refunds"("tenant_id");
CREATE INDEX IF NOT EXISTS "refunds_invoice_idx" ON "refunds"("invoice_id");
CREATE INDEX IF NOT EXISTS "refunds_status_idx" ON "refunds"("tenant_id", "status");
