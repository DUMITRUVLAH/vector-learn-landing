-- Team Docs — VAT-on-imports watchlist: companies for which import VAT must be paid.
CREATE TABLE IF NOT EXISTS "fin_vat_import_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"name" varchar(255) NOT NULL,
	"idno" varchar(20),
	"vat_rate_bp" integer NOT NULL DEFAULT 2000,
	"is_active" boolean NOT NULL DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_vat_import_tenant_idx" ON "fin_vat_import_companies" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_vat_import_tenant_active_idx" ON "fin_vat_import_companies" ("tenant_id", "is_active");
