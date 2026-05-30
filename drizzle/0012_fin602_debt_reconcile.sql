-- FIN-602: Add debt_cents to students + link-invoice on payments
-- Migration prefix: 0012 (follows 0011_fin601_invoices)

ALTER TABLE "students" ADD COLUMN "debt_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

CREATE INDEX "students_debt_idx" ON "students" USING btree ("tenant_id","debt_cents");
