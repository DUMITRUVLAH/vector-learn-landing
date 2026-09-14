-- CRM — captarea lead-urilor de pe site (cerința 68 din caietul de sarcini Ecosolar).
--
-- Un endpoint public n-are sesiune, deci nu știe în ce workspace scrie. Fiecare formular primește
-- un token propriu: dacă un site e compromis sau un partener pleacă, se stinge doar formularul
-- lui. Tokenul e public prin natura lui (stă în pagina web) și nu autorizează decât crearea unui
-- lead — nu citește și nu listează nimic.

CREATE TABLE IF NOT EXISTS "crm_capture_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" varchar(200) NOT NULL,
  "token" varchar(64) NOT NULL,
  "default_source" varchar(40) DEFAULT 'webform' NOT NULL,
  "pipeline_id" uuid,
  "allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "leads_captured" integer DEFAULT 0 NOT NULL,
  "last_capture_at" timestamp with time zone,
  "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_capture_tenant_idx" ON "crm_capture_sources" ("tenant_id");
--> statement-breakpoint
-- Unic pe tot sistemul: tokenul e cel care determină workspace-ul, deci o coliziune ar scrie
-- leadul în baza altui client.
CREATE UNIQUE INDEX IF NOT EXISTS "crm_capture_token_uniq" ON "crm_capture_sources" ("token");
