ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "archived_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_requests_archived_idx" ON "par_requests" ("tenant_id","archived_at");
