-- CRM — excepții de drepturi pe OM, peste matricea rolului (cerința 60).
--
-- Matricea pe roluri rămâne cod: ea garantează că un rol nou nu primește din greșeală drepturi.
-- Aici stau excepțiile, ca date: „Maria e agent, dar ea administrează produsele" — fără să faci
-- toți agenții administratori.
--
-- Două feluri de excepție: `granted = true` adaugă un drept, `false` îl retrage. Fără al doilea,
-- singurul mod de a lua un drept cuiva ar fi să-i schimbi rolul, adică să-i iei și restul.

CREATE TABLE IF NOT EXISTS "crm_user_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "permission" varchar(64) NOT NULL,
  "granted" boolean DEFAULT true NOT NULL,
  "granted_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "crm_user_perms_uniq" UNIQUE("user_id","permission")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_user_perms_tenant_idx" ON "crm_user_permissions" ("tenant_id","user_id");
