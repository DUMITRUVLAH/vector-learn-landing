-- HR-401: payroll_entries table
-- payroll_status enum and payroll_entries table may already exist from
-- an earlier migration attempt on this Supabase instance.

DO $$ BEGIN
  CREATE TYPE "public"."payroll_status" AS ENUM('draft', 'approved', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"month" varchar(7) NOT NULL,
	"total_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"commission_cents" integer DEFAULT 0 NOT NULL,
	"bonus_cents" integer DEFAULT 0 NOT NULL,
	"status" "payroll_status" DEFAULT 'draft' NOT NULL,
	"breakdown" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pe_tenant_idx" ON "payroll_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pe_teacher_idx" ON "payroll_entries" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pe_month_idx" ON "payroll_entries" USING btree ("tenant_id","month");
