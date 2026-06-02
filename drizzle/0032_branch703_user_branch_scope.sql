ALTER TABLE "users" ADD COLUMN "branch_scope" uuid;--> statement-breakpoint
CREATE INDEX "users_branch_scope_idx" ON "users" USING btree ("branch_scope");