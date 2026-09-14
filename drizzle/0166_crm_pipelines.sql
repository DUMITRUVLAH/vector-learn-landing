-- CRM Faza 9 — pâlnii MULTIPLE per workspace.
--
-- Până acum etapele erau unice pe (tenant, key), adică un workspace avea o singură pâlnie.
-- O firmă cu două linii de business (retail și corporate) le ținea pe amândouă în același set de
-- etape. Etapele trec sub o pâlnie, leadul primește `pipeline_id`, iar cheia devine unică ÎN
-- pâlnie — două pâlnii au amândouă dreptul la „new".
--
-- Nimic nu se rescrie la nivel de lead: `leads.pipeline_id` rămâne NULL pentru rândurile vechi,
-- iar codul citește NULL ca „pâlnia implicită a workspace-ului".

CREATE TABLE IF NOT EXISTS "crm_pipelines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" varchar(200) NOT NULL,
  "order_index" integer DEFAULT 0 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_pipelines_tenant_idx" ON "crm_pipelines" ("tenant_id","order_index");
--> statement-breakpoint
ALTER TABLE "crm_pipeline_stages" ADD COLUMN IF NOT EXISTS "pipeline_id" uuid REFERENCES "crm_pipelines"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "pipeline_id" uuid;
--> statement-breakpoint
-- Fiecare workspace care are deja etape primește pâlnia implicită „Vânzări".
INSERT INTO "crm_pipelines" ("tenant_id","name","order_index","is_default")
SELECT DISTINCT s."tenant_id", 'Vânzări', 0, true
FROM "crm_pipeline_stages" s
WHERE NOT EXISTS (SELECT 1 FROM "crm_pipelines" p WHERE p."tenant_id" = s."tenant_id");
--> statement-breakpoint
-- Etapele existente intră în implicita workspace-ului lor.
UPDATE "crm_pipeline_stages" s
SET "pipeline_id" = p."id"
FROM "crm_pipelines" p
WHERE p."tenant_id" = s."tenant_id" AND p."is_default" = true AND s."pipeline_id" IS NULL;
--> statement-breakpoint
-- Unicitatea cheii se mută de pe (tenant, key) pe (tenant, pâlnie, key). Fără pasul ăsta, a doua
-- pâlnie n-ar putea avea propria etapă „new".
DROP INDEX IF EXISTS "crm_stages_tenant_key_uniq";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_stages_tenant_pipeline_key_uniq" ON "crm_pipeline_stages" ("tenant_id","pipeline_id","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_stages_pipeline_idx" ON "crm_pipeline_stages" ("pipeline_id","order_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_pipeline_idx" ON "leads" ("tenant_id","pipeline_id");
