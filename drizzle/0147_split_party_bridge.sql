-- SPLIT-201: PARTY bridge — link par_vendors ↔ fin_parties and itpark_engagements ↔ fin_parties
-- Rule: ADD COLUMN IF NOT EXISTS (idempotent) — never re-CREATE existing tables

ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "fin_party_id" uuid;
--> statement-breakpoint
ALTER TABLE "itpark_engagements" ADD COLUMN IF NOT EXISTS "fin_party_id" uuid;
--> statement-breakpoint

-- FK guards — idempotent, won't fail if constraint already exists
DO $$ BEGIN
  ALTER TABLE "par_vendors"
    ADD CONSTRAINT "par_vendors_fin_party_id_fk"
    FOREIGN KEY ("fin_party_id")
    REFERENCES "fin_parties"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "itpark_engagements"
    ADD CONSTRAINT "itpark_engagements_fin_party_id_fk"
    FOREIGN KEY ("fin_party_id")
    REFERENCES "fin_parties"("id")
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
