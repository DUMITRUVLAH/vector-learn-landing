-- CRM Faza 9 — vizualizări salvate (filtre cu nume).
--
-- Personală implicit: într-un workspace cu echipă, „leadurile mele restante" înseamnă altceva
-- pentru fiecare om. `is_shared` o ridică explicit la nivelul echipei.

CREATE TABLE IF NOT EXISTS "crm_saved_views" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" varchar(200) NOT NULL,
  "filters" jsonb NOT NULL,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "is_shared" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_saved_views_tenant_idx" ON "crm_saved_views" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_saved_views_owner_idx" ON "crm_saved_views" ("tenant_id","created_by_user_id");
