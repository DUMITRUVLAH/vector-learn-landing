-- CRM Faza 2: etape de pâlnie configurabile per workspace.
--
-- `leads.stage` era `lead_stage` (enum), deci orice etapă nouă cerea o migrare —
-- adică o livrare de cod pentru o schimbare de proces comercial. Devine varchar,
-- exact ca în CRM-ul de referință, iar adevărul despre etape trece în tabela de
-- mai jos. Enum-ul `lead_stage` NU se șterge: alte coloane/istoric îl pot
-- referenția, iar ștergerea unui tip e ireversibilă.
--
-- Conversia păstrează valorile existente (`stage::text`), deci niciun lead nu-și
-- schimbă poziția în pâlnie.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'stage' AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE "leads" ALTER COLUMN "stage" DROP DEFAULT;
    ALTER TABLE "leads" ALTER COLUMN "stage" TYPE varchar(64) USING "stage"::text;
    ALTER TABLE "leads" ALTER COLUMN "stage" SET DEFAULT 'new';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crm_pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"key" varchar(64) NOT NULL,
	"label" varchar(100) NOT NULL,
	"color" varchar(40) DEFAULT 'sky' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"probability_pct" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_stages_tenant_idx" ON "crm_pipeline_stages" ("tenant_id","order_index");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_stages_tenant_key_uniq" ON "crm_pipeline_stages" ("tenant_id","key");
--> statement-breakpoint
-- Fiecare workspace existent primește cele 5 etape implicite, cu aceleași chei
-- pe care le au deja lead-urile lui. Idempotent: ON CONFLICT pe (tenant, key).
INSERT INTO "crm_pipeline_stages" ("tenant_id","key","label","color","order_index","is_won","is_lost","is_default","probability_pct")
SELECT t.id, s.key, s.label, s.color, s.order_index, s.is_won, s.is_lost, true, s.probability_pct
FROM "tenants" t
CROSS JOIN (VALUES
  ('new',       'Lead nou',   'sky',      0, false, false, 10),
  ('contacted', 'Contactat',  'lavender', 1, false, false, 25),
  ('trial',     'Trial/Demo', 'peach',    2, false, false, 50),
  ('paid',      'Client',     'mint',     3, true,  false, 100),
  ('lost',      'Pierdut',    'rose',     4, false, true,  0)
) AS s(key,label,color,order_index,is_won,is_lost,probability_pct)
-- Indexul unic de mai sus, nu o constrângere numită: ON CONFLICT pe coloane.
ON CONFLICT ("tenant_id","key") DO NOTHING;
