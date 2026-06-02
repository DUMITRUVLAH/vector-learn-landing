ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "branch_scope" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_branch_scope_idx" ON "users" USING btree ("branch_scope");