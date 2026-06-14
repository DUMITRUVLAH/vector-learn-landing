-- CLIENTPORTAL-001: Client financial portal tokens (magic-link access)
-- Reuses the studentPortalTokens pattern (GAP-010) for B2B clients.
CREATE TABLE IF NOT EXISTS "fin_client_portal_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "company_id" uuid REFERENCES "company_clients"("id") ON DELETE CASCADE,
  "contact_id" uuid REFERENCES "students"("id") ON DELETE CASCADE,
  "token" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "last_used_at" timestamptz,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "fcpt_at_least_one_party" CHECK (contact_id IS NOT NULL OR company_id IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fcpt_tenant_idx" ON "fin_client_portal_tokens" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fcpt_token_idx" ON "fin_client_portal_tokens" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fcpt_company_idx" ON "fin_client_portal_tokens" ("tenant_id", "company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fcpt_contact_idx" ON "fin_client_portal_tokens" ("tenant_id", "contact_id");
