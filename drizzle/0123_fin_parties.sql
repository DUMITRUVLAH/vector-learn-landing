-- PARTY-001: FinDesk business partners schema
-- Tables: fin_parties (client/supplier/both), fin_party_contacts
-- Dependencies: tenants (for tenantId FK reference in app layer — no DB-level FK to keep multi-tenant flexible)

CREATE TYPE "public"."fin_party_kind" AS ENUM('client', 'supplier', 'both');
--> statement-breakpoint
CREATE TABLE "fin_parties" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "kind" "fin_party_kind" NOT NULL,
  "name" text NOT NULL,
  "country" char(2) NOT NULL,
  "idno" varchar(13),
  "vat_code" varchar(20),
  "iban" varchar(34),
  "address" text,
  "city" varchar(100),
  "postal_code" varchar(20),
  "email" varchar(254),
  "phone" varchar(30),
  "is_active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fin_party_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "party_id" uuid NOT NULL REFERENCES "fin_parties"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "role" varchar(100),
  "email" varchar(254),
  "phone" varchar(30),
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "fin_parties_tenant_idx" ON "fin_parties" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "fin_parties_kind_idx" ON "fin_parties" ("tenant_id", "kind");
