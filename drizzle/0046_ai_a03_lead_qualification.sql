ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualification" varchar(10);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_qual_idx" ON "leads" USING btree ("tenant_id","qualification");