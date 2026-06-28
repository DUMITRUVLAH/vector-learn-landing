-- STMT-004: Add xml_payload to fin_einvoices for ZIP download of submitted XML e-facturi.
--
-- fin_sfs_settings and fin_einvoices are pre-existing tables in prod (no CREATE migration
-- in this repo). Bootstrap them unconditionally with IF NOT EXISTS so PGlite can run.

CREATE TABLE IF NOT EXISTS "fin_sfs_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE,
  "idno" varchar(13) NOT NULL DEFAULT '',
  "bank_account" varchar(34) NOT NULL DEFAULT '',
  "environment" varchar(10) NOT NULL DEFAULT 'mock',
  "username_encrypted" text,
  "password_encrypted" text,
  "last_tested_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fin_einvoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "fin_invoice_id" uuid NOT NULL,
  "sfs_status" varchar(20) NOT NULL DEFAULT 'pending',
  "sfs_serial_number" varchar(50),
  "sfs_invoice_id" varchar(100),
  "sfs_request_status" integer,
  "sfs_error_message" text,
  "xml_payload" text,
  "submitted_at" timestamp with time zone,
  "last_sync_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fin_einvoices_invoice_unique" UNIQUE ("fin_invoice_id")
);
--> statement-breakpoint
ALTER TABLE "fin_einvoices" ADD COLUMN IF NOT EXISTS "xml_payload" text;
