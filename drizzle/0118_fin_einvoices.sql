-- EINV-001: FinDesk e-Factura Moldova (SFS) — settings + tracking tables
-- Migration: 0118_fin_einvoices.sql
-- Prefix 0118 > max on main (0114) and > all pending FIN branches (0115-0117)

-- Enum: SFS environment
CREATE TYPE "fin_sfs_env" AS ENUM('mock', 'test', 'prod');
--> statement-breakpoint

-- Enum: SFS e-Factura submission status
CREATE TYPE "fin_einvoice_status" AS ENUM('pending', 'sent', 'accepted', 'rejected', 'cancelled');
--> statement-breakpoint

-- Table: fin_sfs_settings (per-tenant SFS configuration)
CREATE TABLE "fin_sfs_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE,
  "idno" varchar(13) NOT NULL,
  "bank_account" varchar(34) NOT NULL,
  "environment" "fin_sfs_env" NOT NULL DEFAULT 'mock',
  "username_encrypted" text,
  "password_encrypted" text,
  "last_tested_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Table: fin_einvoices (SFS submission tracking per B2B invoice)
CREATE TABLE "fin_einvoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "fin_invoice_id" uuid NOT NULL,
  "sfs_status" "fin_einvoice_status" NOT NULL DEFAULT 'pending',
  "sfs_serial_number" varchar(50),
  "sfs_invoice_id" varchar(100),
  "sfs_request_status" integer,
  "sfs_error_message" text,
  "submitted_at" timestamptz,
  "last_sync_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "fin_einvoices_invoice_unique" UNIQUE ("fin_invoice_id")
);
--> statement-breakpoint

-- Indexes
CREATE INDEX "fin_sfs_settings_tenant_idx" ON "fin_sfs_settings" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "fin_einvoices_tenant_status_idx" ON "fin_einvoices" ("tenant_id", "sfs_status");
--> statement-breakpoint
CREATE INDEX "fin_einvoices_invoice_idx" ON "fin_einvoices" ("fin_invoice_id");
