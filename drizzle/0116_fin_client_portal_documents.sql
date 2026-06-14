-- CLIENTPORTAL-003: Documents uploaded by client through the financial portal
CREATE TABLE IF NOT EXISTS "fin_client_portal_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "portal_token_id" uuid NOT NULL REFERENCES "fin_client_portal_tokens"("id") ON DELETE CASCADE,
  "original_name" varchar(500) NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "size_bytes" integer NOT NULL,
  "storage_path" text NOT NULL,
  "uploaded_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fcpd_tenant_idx" ON "fin_client_portal_documents" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fcpd_token_idx" ON "fin_client_portal_documents" ("portal_token_id");
