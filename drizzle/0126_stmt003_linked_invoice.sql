-- STMT-003: Add linked_fin_invoice_id to fin_capture_lines
-- Links a statement transaction line to the fin_invoice created when submitting to e-Factura SFS.
--
-- fin_invoices is a pre-existing table in prod (no CREATE migration in this repo).
-- Bootstrap it unconditionally with IF NOT EXISTS so PGlite (CI / schema-drift gate) can run.
-- Prod already has it; IF NOT EXISTS is a no-op there.

CREATE TABLE IF NOT EXISTS "fin_invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "party_id" uuid,
  "number" varchar(50),
  "invoice_number" varchar(50),
  "status" varchar(20) NOT NULL DEFAULT 'draft',
  "issued_at" date,
  "due_at" date,
  "due_date" date,
  "total_cents" integer NOT NULL DEFAULT 0,
  "vat_cents" integer NOT NULL DEFAULT 0,
  "vat_total_cents" integer NOT NULL DEFAULT 0,
  "currency" varchar(3) NOT NULL DEFAULT 'MDL',
  "series" varchar(20) NOT NULL DEFAULT 'FIN',
  "agreement_id" uuid,
  "notes" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fin_capture_lines"
  ADD COLUMN IF NOT EXISTS "linked_fin_invoice_id" uuid
  REFERENCES "fin_invoices"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_cap_lines_linked_inv_idx"
  ON "fin_capture_lines"("linked_fin_invoice_id");
