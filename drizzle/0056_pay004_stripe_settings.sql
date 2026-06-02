-- Stripe settings table (one row per tenant)
CREATE TABLE IF NOT EXISTS "stripe_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE,
  "publishable_key" varchar(255),
  "secret_key_encrypted" varchar(512),
  "webhook_secret_encrypted" varchar(512),
  "enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stripe_settings_tenant_idx" ON "stripe_settings"("tenant_id");
--> statement-breakpoint
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "stripe_payment_intent_id" varchar(100);
--> statement-breakpoint
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "stripe_payment_link_url" varchar(2048);
--> statement-breakpoint
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "payment_method" varchar(20);
