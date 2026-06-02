-- PAY-005: Invoice reminders table
-- Migration 0033

CREATE TABLE IF NOT EXISTS "invoice_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE CASCADE,
  "reminder_day" integer NOT NULL,
  "channel" varchar(20) NOT NULL DEFAULT 'email',
  "status" varchar(20) NOT NULL DEFAULT 'sent',
  "body" varchar(2000),
  "sent_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "invoice_reminders_uniq_invoice_day" UNIQUE("invoice_id", "reminder_day")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_reminders_tenant_idx" ON "invoice_reminders"("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_reminders_invoice_idx" ON "invoice_reminders"("invoice_id");
