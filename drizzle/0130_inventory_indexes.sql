-- ============================================================================
-- 0130_inventory_indexes.sql
-- PERF-04: add the missing indexes on fin_inventory_items + fin_stock_movements.
-- These were the only two tenant-scoped tables with zero indexes → seq scans on every
-- inventory page load + unbounded growth on the append-only movements ledger.
-- IF NOT EXISTS so it's a no-op if already present.
-- ============================================================================

CREATE INDEX IF NOT EXISTS "fin_inventory_items_tenant_idx" ON "fin_inventory_items" ("tenant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fin_stock_movements_tenant_idx" ON "fin_stock_movements" ("tenant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fin_stock_movements_item_idx" ON "fin_stock_movements" ("item_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "fin_stock_movements_tenant_date_idx" ON "fin_stock_movements" ("tenant_id", "created_at");
