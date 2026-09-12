-- VM5-19: pragul anual per prestator + bifa că procedura de achiziție s-a făcut.
--
-- Pragul stă în lei, deși cererile pot fi în orice monedă: comparația se face pe echivalentul MDL
-- înghețat la depunere, ca în rapoarte. 0 = regula e oprită (comportamentul de până acum).
ALTER TABLE "par_settings" ADD COLUMN IF NOT EXISTS "tender_threshold_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_tender_clearances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "vendor_id" uuid,
  "vendor_key" varchar(300) NOT NULL,
  "vendor_name" varchar(300),
  "year" integer NOT NULL,
  "cleared_by_user_id" uuid,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "par_tender_clearances" ADD CONSTRAINT "par_tender_clearances_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "par_tender_clearances" ADD CONSTRAINT "par_tender_clearances_vendor_id_par_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "public"."par_vendors"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "par_tender_clearances" ADD CONSTRAINT "par_tender_clearances_cleared_by_user_id_users_id_fk"
    FOREIGN KEY ("cleared_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_tender_clearances_tenant_idx" ON "par_tender_clearances" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_tender_clearances_vendor_year_uq" ON "par_tender_clearances" ("tenant_id","vendor_key","year");
