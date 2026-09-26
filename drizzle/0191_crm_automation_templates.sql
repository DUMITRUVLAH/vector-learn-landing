-- CRM-A02: scenariile gata făcute — regula ține minte din ce scenariu a pornit.
ALTER TABLE "crm_automations" ADD COLUMN IF NOT EXISTS "template_key" varchar(60);
--> statement-breakpoint
ALTER TABLE "crm_assignment_rules" ADD COLUMN IF NOT EXISTS "template_key" varchar(60);
