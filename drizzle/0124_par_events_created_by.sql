-- PAR Feature 2: add created_by_user_id to par_events (who + when added is now tracked)
-- Prefix 0123 (> 0122_par_attachment_url_text, the current last migration on main).
ALTER TABLE "par_events" ADD COLUMN "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
