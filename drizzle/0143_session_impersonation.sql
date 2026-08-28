-- PLATFORM-403: sesiuni de impersonare pentru superadminul platformei.
-- `impersonated_by_user_id` marchează sesiunea ca fiind deschisă de altcineva (testare/suport);
-- `impersonator_token` păstrează sesiunea proprie a superadminului, ca ieșirea să o repună.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "impersonated_by_user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "impersonator_token" varchar(128);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_impersonated_by_idx" ON "sessions" ("impersonated_by_user_id");
