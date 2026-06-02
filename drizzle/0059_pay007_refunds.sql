DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'refunded' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'invoice_status')) THEN
    ALTER TYPE "invoice_status" ADD VALUE 'refunded';
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'partially_refunded' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'invoice_status')) THEN
    ALTER TYPE "invoice_status" ADD VALUE 'partially_refunded';
  END IF;
END$$;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "refunded_amount_cents" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_status') THEN
    CREATE TYPE "refund_status" AS ENUM ('pending', 'completed', 'failed');
  END IF;
END$$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_method') THEN
    CREATE TYPE "refund_method" AS ENUM ('stripe', 'manual');
  END IF;
END$$;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refunds_tenant_idx" ON "refunds"("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refunds_invoice_idx" ON "refunds"("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refunds_status_idx" ON "refunds"("tenant_id", "status");
