-- AUTH-005: Google Sign-In (OAuth 2.0 / OIDC).
-- Adds Google identity columns and relaxes password_hash to nullable so that
-- accounts created via Google (which have no local password) are valid.
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_provider" varchar(20) DEFAULT 'password' NOT NULL;
--> statement-breakpoint
-- Unique per Google subject id. Postgres treats NULLs as distinct, so the many
-- password-only rows (google_id IS NULL) do not collide.
CREATE UNIQUE INDEX "users_google_id_uniq" ON "users" ("google_id");
