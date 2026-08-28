-- PAR-EFP: urmărirea e-Facturii pe care prestatorul trebuie să o emită după plata unui PAR.
-- Un rând per cerere; „expected" + `last_scan_at` completat = am căutat în SFS și NU am găsit-o.
DO $$ BEGIN
  CREATE TYPE "par_einvoice_status" AS ENUM ('not_applicable', 'expected', 'found', 'received_manual');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_einvoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "par_id" uuid NOT NULL REFERENCES "par_requests"("id") ON DELETE cascade,
  "status" "par_einvoice_status" NOT NULL DEFAULT 'expected',
  "supplier_idno" varchar(50),
  "sfs_seria" varchar(20),
  "sfs_number" varchar(50),
  "sfs_invoice_status" integer,
  "invoice_date" timestamp with time zone,
  "invoice_total_cents" integer,
  "last_scan_at" timestamp with time zone,
  "last_scan_source" varchar(10),
  "last_scan_message" text,
  "reminder_count" integer NOT NULL DEFAULT 0,
  "last_reminder_at" timestamp with time zone,
  "last_reminder_to_email" varchar(255),
  "marked_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "marked_note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_einvoices_par_unique" ON "par_einvoices" ("par_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_einvoices_tenant_status_idx" ON "par_einvoices" ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_einvoices_par_idx" ON "par_einvoices" ("par_id");
