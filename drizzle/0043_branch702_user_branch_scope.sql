-- BRANCH-702: Add branch_scope to users for branch-manager role scoping
-- Users with branch_scope set can only see data for that branch.
-- Migration prefix: 0032 (follows 0031_branch701_branches)

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "branch_scope" uuid REFERENCES "branches"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_branch_scope_idx" ON "users" USING btree ("tenant_id","branch_scope");
