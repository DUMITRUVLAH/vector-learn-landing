-- CRM Faza 9 — stoc pe produsele din catalog, scăzut automat la vânzare.
--
-- NU creează o a doua gestiune de stoc: leagă produsul CRM de articolul de inventar
-- al FinDesk (`fin_inventory_items`), care are deja cantitate, cost mediu ponderat și
-- jurnal de mișcări. Un produs fără legătură (serviciu, consultanță) rămâne exact cum era.
--
-- Fără FOREIGN KEY, ca la `leads.product_id` (migrarea 0171): coloana e o legătură între
-- două module care pot avea migrările desincronizate în producție, iar un FK ar transforma
-- o întârziere de migrare într-o eroare la scriere. Articolele de inventar se arhivează,
-- nu se șterg (mișcările le țin cu ON DELETE restrict), deci legătura nu rămâne suspendată.
ALTER TABLE "crm_products" ADD COLUMN IF NOT EXISTS "inventory_item_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_products_inventory_idx" ON "crm_products" ("tenant_id","inventory_item_id");
--> statement-breakpoint
-- Câte bucăți acoperă oportunitatea. 1 = cazul implicit de până acum.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "product_qty" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
-- Mișcarea de ieșire care a consumat stocul pentru acest lead. Prezența ei e garanția
-- de idempotență: un lead mutat înainte-înapoi peste etapa „câștigat" scade stocul O SINGURĂ dată.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "stock_movement_id" uuid;
