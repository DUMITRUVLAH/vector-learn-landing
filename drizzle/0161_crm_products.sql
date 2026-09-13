-- CRM Faza 1: catalogul de produse/servicii.
-- Tabela e pe calea de request (pagina /business/crm/produse o interoghează la
-- fiecare încărcare), deci are și heal în server/db/sync-schema.ts — prod-ul
-- primește codul înainte ca migrarea să se aplice.
CREATE TABLE IF NOT EXISTS "crm_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"sku" varchar(60),
	"name" varchar(200) NOT NULL,
	"category" varchar(120),
	"description" text,
	"unit" varchar(30) DEFAULT 'buc' NOT NULL,
	"list_price_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(8) DEFAULT 'MDL' NOT NULL,
	"vat_percent" numeric DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_products_tenant_idx" ON "crm_products" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_products_active_idx" ON "crm_products" ("tenant_id","is_active");
