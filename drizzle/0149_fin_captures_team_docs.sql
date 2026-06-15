-- Team Docs: shared month-end document inbox built on fin_captures.
-- Adds a `team` column so non-finance teams (marketing, IT, ops…) can tag uploads
-- for month-end grouping by the accountant. `purpose` is stored inside the existing
-- extracted_fields JSONB (no column needed).
ALTER TABLE "fin_captures" ADD COLUMN IF NOT EXISTS "team" varchar(20) NOT NULL DEFAULT 'other';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fin_captures_tenant_team_idx" ON "fin_captures" ("tenant_id", "team");
