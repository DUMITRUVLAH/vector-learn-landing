DO $$
BEGIN
  CREATE TYPE "public"."task_status" AS ENUM('open', 'done', 'snoozed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpointDO $$
BEGIN
  CREATE TYPE "public"."template_channel" AS ENUM('email', 'whatsapp', 'sms');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(100) NOT NULL,
	"color" varchar(50) DEFAULT 'pastel-sky' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"file_name" varchar(300) NOT NULL,
	"file_url" varchar(1000) NOT NULL,
	"mime" varchar(100) NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"title" varchar(300) NOT NULL,
	"due_at" timestamp with time zone,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"created_by" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"channel" "template_channel" NOT NULL,
	"subject" varchar(500),
	"body" text NOT NULL,
	"variables" varchar(1000) DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "assigned_to" uuid;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_revoked_at" timestamp with time zone;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_attachments" ADD CONSTRAINT "lead_attachments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_attachments" ADD CONSTRAINT "lead_attachments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_attachments" ADD CONSTRAINT "lead_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_tenant_idx" ON "pipeline_stages" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ps_key_idx" ON "pipeline_stages" USING btree ("tenant_id","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "la_tenant_idx" ON "lead_attachments" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "la_lead_idx" ON "lead_attachments" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lt_tenant_idx" ON "lead_tasks" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lt_lead_idx" ON "lead_tasks" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lt_status_idx" ON "lead_tasks" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mt_tenant_idx" ON "message_templates" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mt_channel_idx" ON "message_templates" USING btree ("tenant_id","channel");
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
