DO $$
BEGIN
  CREATE TYPE "public"."trial_result" AS ENUM('interested', 'not_interested', 'no_show');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "is_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "trial_lead_id" uuid;--> statement-breakpoint
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "trial_result" "trial_result";--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lessons" ADD CONSTRAINT "lessons_trial_lead_id_leads_id_fk" FOREIGN KEY ("trial_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;