-- INVENTORY-001: Gestiune stoc materiale didactice
-- Tabele: fin_inventory_items (catalog), fin_stock_movements (jurnal mișcări CMP)
-- Metoda contabilă: Cost Mediu Ponderat (SNC 2 Moldova)

CREATE TABLE IF NOT EXISTS "fin_inventory_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "sku" varchar(50),
  "unit" varchar(20) NOT NULL DEFAULT 'buc',
  "description" text,
  "qty_on_hand" bigint NOT NULL DEFAULT 0,
  "avg_cost_cents" bigint NOT NULL DEFAULT 0,
  "min_qty_alert" bigint DEFAULT 0,
  "category" varchar(50),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_inventory_items_tenant_idx" ON "fin_inventory_items" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_inventory_items_tenant_category_idx" ON "fin_inventory_items" ("tenant_id", "category");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fin_stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "item_id" uuid NOT NULL REFERENCES "fin_inventory_items"("id") ON DELETE RESTRICT,
  "movement_type" varchar(30) NOT NULL,
  "qty" bigint NOT NULL,
  "unit_cost_cents" bigint NOT NULL DEFAULT 0,
  "total_cost_cents" bigint NOT NULL DEFAULT 0,
  "invoice_id" uuid REFERENCES "invoices"("id") ON DELETE SET NULL,
  "reference" varchar(100),
  "notes" text,
  "branch_id" uuid,
  "moved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "moved_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_stock_movements_tenant_item_idx" ON "fin_stock_movements" ("tenant_id", "item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_stock_movements_tenant_type_idx" ON "fin_stock_movements" ("tenant_id", "movement_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_stock_movements_item_moved_at_idx" ON "fin_stock_movements" ("item_id", "moved_at");
