-- CRM — produsul și probabilitatea, pe oportunitate (cerința 10 din caietul de sarcini).
--
-- „Produsul" unui lead era textul liber din `interest_course`, iar raportul „pe produs" grupa
-- după ce a tastat fiecare om: „Panouri 10kW", „panouri 10 kw" și „PV 10" apăreau ca trei
-- produse. Catalogul `crm_products` exista deja, dar nimic nu lega leadul de el.
--
-- `interest_course` NU se șterge și nu se migrează automat în `product_id`: textul e ce a cerut
-- clientul, cu cuvintele lui, iar o potrivire ghicită ar falsifica exact raportul pe care
-- încercăm să-l facem demn de încredere. Legătura se face pe măsură ce oamenii deschid fișele.

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "product_id" uuid REFERENCES "crm_products"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "probability_pct" integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_product_idx" ON "leads" ("tenant_id","product_id");
