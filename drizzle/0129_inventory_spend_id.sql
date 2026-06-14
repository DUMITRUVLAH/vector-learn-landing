-- INVENTORY-002: Adaugă spend_id la fin_stock_movements pentru trasabilitate achiziții
-- spend_id referenciaza un document de achiziție extern (fără FK hard — tabelul de spend nu există)

ALTER TABLE "fin_stock_movements" ADD COLUMN IF NOT EXISTS "spend_id" uuid;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_stock_movements_spend_id_idx" ON "fin_stock_movements" ("spend_id");
