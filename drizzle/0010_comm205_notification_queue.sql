DO $$
BEGIN
  CREATE TYPE "public"."notification_recipient_type" AS ENUM('lead', 'student');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recipient_type" "notification_recipient_type" NOT NULL,
	"recipient_id" uuid NOT NULL,
	"channel" "message_channel" NOT NULL,
	"payload" jsonb NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"skipped_reason" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "timezone" varchar(60) DEFAULT 'Europe/Bucharest' NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "notification_queue" ADD CONSTRAINT "notification_queue_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nq_tenant_idx" ON "notification_queue" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nq_recipient_idx" ON "notification_queue" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "nq_schedule_idx" ON "notification_queue" USING btree ("tenant_id","scheduled_for");