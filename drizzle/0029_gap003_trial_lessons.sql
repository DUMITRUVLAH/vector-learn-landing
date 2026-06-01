CREATE TYPE "public"."trial_result" AS ENUM('interested', 'not_interested', 'no_show');--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "is_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "trial_lead_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN "trial_result" "trial_result";--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_trial_lead_id_leads_id_fk" FOREIGN KEY ("trial_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;