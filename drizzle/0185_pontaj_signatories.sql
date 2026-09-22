ALTER TABLE "pontaj_org_settings" ADD COLUMN IF NOT EXISTS "signatory_head" varchar(200);
--> statement-breakpoint
ALTER TABLE "pontaj_org_settings" ADD COLUMN IF NOT EXISTS "signatory_recorder" varchar(200);
--> statement-breakpoint
ALTER TABLE "pontaj_org_settings" ADD COLUMN IF NOT EXISTS "signatory_hr" varchar(200);
