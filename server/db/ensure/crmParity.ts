/**
 * Heal pentru tabelele CRM din Faza 9 (paritate cu crm-vector).
 *
 * `sync-schema` adaugă generic COLOANE lipsă, dar nu și TABELE — iar producția nu aplică fiabil
 * migrările (vezi comentariul din `server/db/sync-schema.ts`). Fără instrucțiunile de mai jos,
 * primul GET care atinge o tabelă nouă dă 500 până când migrarea ajunge acolo.
 *
 * Toate sunt idempotente (`IF NOT EXISTS`) și non-distructive. O singură instrucțiune per intrare
 * — executorul le rulează una câte una.
 */
export const CRM_PARITY_ENSURE_STATEMENTS: string[] = [
  // ── Pâlnii multiple (migrarea 0166) ────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "crm_pipelines" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "name" varchar(200) NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "crm_pipelines_tenant_idx" ON "crm_pipelines" ("tenant_id","order_index")`,
  // Unicitatea cheii de etapă se mută pe (tenant, pâlnie, key). Indexul vechi trebuie să dispară,
  // altfel a doua pâlnie nu-și poate crea propria etapă „new".
  `DROP INDEX IF EXISTS "crm_stages_tenant_key_uniq"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "crm_stages_tenant_pipeline_key_uniq" ON "crm_pipeline_stages" ("tenant_id","pipeline_id","key")`,
  `CREATE INDEX IF NOT EXISTS "crm_stages_pipeline_idx" ON "crm_pipeline_stages" ("pipeline_id","order_index")`,
  `CREATE INDEX IF NOT EXISTS "leads_pipeline_idx" ON "leads" ("tenant_id","pipeline_id")`,
];
