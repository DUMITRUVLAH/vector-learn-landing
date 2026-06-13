-- AGREEMENT-001: FinDesk commercial agreements schema
-- Tables: fin_agreements (contracts), fin_agreement_services (line items)
-- Enums: fin_agreement_status, fin_billing_type, fin_recurrence_period
-- Note: partyId is nullable (set null on party delete) — no DB-level FK to fin_parties
--       because fin_parties may be on a parallel branch; FK added in AGREEMENT-003 or via sync-schema.

CREATE TYPE "public"."fin_agreement_status" AS ENUM('draft', 'active', 'paused', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."fin_billing_type" AS ENUM('recurring', 'one_time');
--> statement-breakpoint
CREATE TYPE "public"."fin_recurrence_period" AS ENUM('monthly', 'quarterly', 'yearly');
--> statement-breakpoint
CREATE TABLE "fin_agreements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "party_id" uuid,
  "title" text NOT NULL,
  "status" "fin_agreement_status" NOT NULL DEFAULT 'draft',
  "start_date" date,
  "end_date" date,
  "currency" char(3) NOT NULL DEFAULT 'MDL',
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_agreement_services" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agreement_id" uuid NOT NULL REFERENCES "fin_agreements"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "billing_type" "fin_billing_type" NOT NULL,
  "unit_price_cents" integer NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "vat_pct" integer NOT NULL DEFAULT 0,
  "recurrence_period" "fin_recurrence_period",
  "next_bill_date" date,
  "last_billed_at" timestamp with time zone,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fin_agreements_tenant_idx" ON "fin_agreements" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "fin_agreements_party_idx" ON "fin_agreements" ("tenant_id", "party_id");
--> statement-breakpoint
CREATE INDEX "fin_agreement_services_agreement_idx" ON "fin_agreement_services" ("agreement_id");
