ALTER TABLE "par_member_profiles" ADD COLUMN IF NOT EXISTS "verifier_user_id" uuid REFERENCES "users"("id") ON DELETE set null;
