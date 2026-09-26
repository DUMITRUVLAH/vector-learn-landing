-- CRM-G09: aranjamentul personal al ecranului de rapoarte (ordine, secțiuni ascunse, plăcuțe).
CREATE TABLE IF NOT EXISTS "crm_report_layouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "layout" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_report_layouts_user_uniq" ON "crm_report_layouts" ("tenant_id","user_id");
