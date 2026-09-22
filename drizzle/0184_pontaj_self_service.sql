CREATE TABLE IF NOT EXISTS "pontaj_org_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"country" varchar(8) DEFAULT 'MD' NOT NULL,
	"full_daily_norm_minutes" integer DEFAULT 480 NOT NULL,
	"work_weekdays" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
	"unit_name" varchar(300),
	"subdivision_name" varchar(300),
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pontaj_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"daily_minutes" integer DEFAULT 480 NOT NULL,
	"job_title" varchar(300),
	"staff_code" varchar(60),
	"reduced_schedule" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pontaj_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"holiday_date" date NOT NULL,
	"name" varchar(200) NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pontaj_leaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"symbol" varchar(4) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pontaj_day_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"symbol" varchar(4) NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"note" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pontaj_org_settings" ADD CONSTRAINT "pontaj_org_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pontaj_org_settings" ADD CONSTRAINT "pontaj_org_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pontaj_profiles" ADD CONSTRAINT "pontaj_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pontaj_profiles" ADD CONSTRAINT "pontaj_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pontaj_holidays" ADD CONSTRAINT "pontaj_holidays_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pontaj_holidays" ADD CONSTRAINT "pontaj_holidays_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pontaj_leaves" ADD CONSTRAINT "pontaj_leaves_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pontaj_leaves" ADD CONSTRAINT "pontaj_leaves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pontaj_day_entries" ADD CONSTRAINT "pontaj_day_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pontaj_day_entries" ADD CONSTRAINT "pontaj_day_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pontaj_org_settings_tenant_uniq" ON "pontaj_org_settings" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pontaj_profiles_tenant_user_uniq" ON "pontaj_profiles" ("tenant_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pontaj_profiles_tenant_idx" ON "pontaj_profiles" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pontaj_holidays_tenant_date_uniq" ON "pontaj_holidays" ("tenant_id","holiday_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pontaj_holidays_tenant_idx" ON "pontaj_holidays" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pontaj_leaves_tenant_user_idx" ON "pontaj_leaves" ("tenant_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pontaj_leaves_range_idx" ON "pontaj_leaves" ("tenant_id","user_id","start_date","end_date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pontaj_day_entries_user_date_uniq" ON "pontaj_day_entries" ("tenant_id","user_id","entry_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pontaj_day_entries_month_idx" ON "pontaj_day_entries" ("tenant_id","user_id","entry_date");
