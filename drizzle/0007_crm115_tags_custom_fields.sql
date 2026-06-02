DO $$
BEGIN
  CREATE TYPE "public"."custom_field_type" AS ENUM('text', 'select', 'number');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"label" varchar(200) NOT NULL,
	"type" "custom_field_type" DEFAULT 'text' NOT NULL,
	"options" jsonb,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"full_name" varchar(200) NOT NULL,
	"role" varchar(100),
	"phone" varchar(32),
	"email" varchar(255),
	"is_primary" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"value" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"tag" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "value_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "debt_cents" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "company" varchar(300);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "deal_name" varchar(300);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_field_values" ADD CONSTRAINT "lead_field_values_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_field_values" ADD CONSTRAINT "lead_field_values_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_field_values" ADD CONSTRAINT "lead_field_values_field_id_custom_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."custom_fields"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cf_tenant_idx" ON "custom_fields" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cf_key_idx" ON "custom_fields" USING btree ("tenant_id","key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lc_tenant_idx" ON "lead_contacts" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lc_lead_idx" ON "lead_contacts" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lfv_tenant_idx" ON "lead_field_values" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lfv_lead_idx" ON "lead_field_values" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lfv_unique_idx" ON "lead_field_values" USING btree ("lead_id","field_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ltags_tenant_idx" ON "lead_tags" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ltags_lead_idx" ON "lead_tags" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ltags_unique_idx" ON "lead_tags" USING btree ("lead_id","tag");
