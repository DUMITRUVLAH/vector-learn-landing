-- BILL-001: FinDesk B2B invoicing schema
-- Tables: fin_invoices, fin_invoice_lines, fin_invoice_reminders
-- FIN-CORE §1.5: completely separate from the student `invoices` table (B2C context)
-- FIN-CORE Rule #1: vatPct NOT NULL per line — mandatory TVA per riga
-- Migration: 0117 (max on main = 0114; 0115 on EFMD branch, 0116 on FIN branches)

CREATE TYPE "public"."fin_invoice_status" AS ENUM('draft', 'issued', 'paid', 'overdue', 'cancelled');
--> statement-breakpoint
CREATE TABLE "fin_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "agreement_id" uuid,
  "party_id" uuid,
  "series" varchar(20) NOT NULL DEFAULT 'FIN',
  "number" integer NOT NULL,
  "invoice_number" varchar(30) NOT NULL,
  "status" "fin_invoice_status" NOT NULL DEFAULT 'draft',
  "currency" varchar(3) NOT NULL DEFAULT 'MDL',
  "issued_at" timestamptz,
  "due_date" date,
  "total_cents" integer NOT NULL DEFAULT 0,
  "vat_total_cents" integer NOT NULL DEFAULT 0,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fin_invoice_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL REFERENCES "fin_invoices"("id") ON DELETE CASCADE,
  "service_id" uuid,
  "description" text NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "unit_price_cents" integer NOT NULL,
  "vat_pct" integer NOT NULL DEFAULT 0,
  "line_total_cents" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fin_invoice_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "invoice_id" uuid NOT NULL REFERENCES "fin_invoices"("id") ON DELETE CASCADE,
  "reminder_day" integer NOT NULL,
  "channel" varchar(20) NOT NULL DEFAULT 'email',
  "status" varchar(20) NOT NULL DEFAULT 'sent',
  "body" varchar(2000),
  "sent_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "fin_invoice_reminders_uniq_invoice_day" UNIQUE ("invoice_id", "reminder_day")
);
--> statement-breakpoint
CREATE INDEX "fin_invoices_tenant_idx" ON "fin_invoices" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "fin_invoices_party_idx" ON "fin_invoices" ("tenant_id", "party_id");
--> statement-breakpoint
CREATE INDEX "fin_invoices_status_idx" ON "fin_invoices" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX "fin_invoices_number_idx" ON "fin_invoices" ("tenant_id", "number");
--> statement-breakpoint
CREATE INDEX "fin_invoice_lines_invoice_idx" ON "fin_invoice_lines" ("invoice_id");
--> statement-breakpoint
CREATE INDEX "fin_invoice_reminders_tenant_idx" ON "fin_invoice_reminders" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "fin_invoice_reminders_invoice_idx" ON "fin_invoice_reminders" ("invoice_id");
