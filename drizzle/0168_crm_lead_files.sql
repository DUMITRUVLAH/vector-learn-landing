-- CRM Faza 9 — fișierele leadului trec în Supabase Storage.
--
-- `lead_attachments` există din migrarea 0002, dar n-a fost niciodată declarată în schema
-- drizzle, deci codul n-o putea interoga. Acum primește `storage_path` (conținutul stă în
-- bucket, nu în Postgres), iar `file_url` devine opțional: rândurile vechi (data-URL sau link
-- extern) rămân citibile, cele noi nu-l mai folosesc.

ALTER TABLE "lead_attachments" ADD COLUMN IF NOT EXISTS "storage_path" varchar(512);
--> statement-breakpoint
ALTER TABLE "lead_attachments" ALTER COLUMN "file_url" DROP NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "la_tenant_idx" ON "lead_attachments" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "la_lead_idx" ON "lead_attachments" ("lead_id");
