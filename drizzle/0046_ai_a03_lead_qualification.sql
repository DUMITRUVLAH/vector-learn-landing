ALTER TABLE "leads" ADD COLUMN "qualification" varchar(10);--> statement-breakpoint
CREATE INDEX "leads_qual_idx" ON "leads" USING btree ("tenant_id","qualification");