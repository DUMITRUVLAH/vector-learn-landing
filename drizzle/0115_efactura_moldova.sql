-- EFMD: SIA e-Factura Moldova (SFS) — coloane de tracking pe invoices.
-- Integrare semiautomatizată: trimitem prin API (PostInvoices), semnarea se
-- face manual în web UI-ul SFS; aici ținem seria/numărul/statusul sincronizat.
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "efactura_md_seria" varchar(20);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "efactura_md_number" varchar(30);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "efactura_md_status" integer;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "efactura_md_request_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "efactura_md_submitted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "efactura_md_message" text;
