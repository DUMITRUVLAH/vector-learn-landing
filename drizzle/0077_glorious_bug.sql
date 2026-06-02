CREATE TABLE IF NOT EXISTS "lead_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"interaction_id" uuid NOT NULL,
	"mentioned_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "in_app_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"kind" varchar(32) DEFAULT 'mention' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_mentions" ADD CONSTRAINT "lead_mentions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_mentions" ADD CONSTRAINT "lead_mentions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_mentions" ADD CONSTRAINT "lead_mentions_interaction_id_lead_interactions_id_fk" FOREIGN KEY ("interaction_id") REFERENCES "public"."lead_interactions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_mentions" ADD CONSTRAINT "lead_mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lm_tenant_idx" ON "lead_mentions" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lm_lead_idx" ON "lead_mentions" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lm_interaction_idx" ON "lead_mentions" USING btree ("interaction_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lm_user_idx" ON "lead_mentions" USING btree ("mentioned_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ian_tenant_idx" ON "in_app_notifications" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ian_recipient_idx" ON "in_app_notifications" USING btree ("recipient_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ian_unread_idx" ON "in_app_notifications" USING btree ("recipient_user_id","read_at");
