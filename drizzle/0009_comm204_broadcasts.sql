DO $$
BEGIN
  CREATE TYPE "public"."broadcast_status" AS ENUM('draft', 'sending', 'done', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"channel" "message_channel" NOT NULL,
	"segment_filter" jsonb NOT NULL,
	"template_id" uuid,
	"body" text NOT NULL,
	"subject" varchar(500),
	"status" "broadcast_status" DEFAULT 'draft' NOT NULL,
	"total_recipients" integer DEFAULT 0 NOT NULL,
	"consent_skipped" integer DEFAULT 0 NOT NULL,
	"queued" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bc_tenant_idx" ON "broadcasts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bc_status_idx" ON "broadcasts" USING btree ("tenant_id","status");