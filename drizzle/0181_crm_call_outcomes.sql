ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "call_attempts" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_call_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_call_outcome" varchar(40);
