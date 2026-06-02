DO $$ BEGIN
  CREATE TYPE "public"."beneficiary_type" AS ENUM('pf', 'pj');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."contract_currency" AS ENUM('MDL', 'EUR', 'RON');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."contract_format" AS ENUM('fizic', 'online');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" varchar(64) NOT NULL,
	"prefix" varchar(10) DEFAULT 'VL' NOT NULL,
	"daily_seq" integer DEFAULT 1 NOT NULL,
	"contract_date" date NOT NULL,
	"beneficiary_type" "beneficiary_type" DEFAULT 'pf' NOT NULL,
	"beneficiary_name" varchar(300),
	"idn" varchar(20),
	"company_name" varchar(300),
	"company_idno" varchar(20),
	"rep_name" varchar(200),
	"rep_role" varchar(100),
	"course" varchar(200),
	"hours" integer,
	"schedule_text" varchar(500),
	"language" varchar(100),
	"format" "contract_format",
	"location" varchar(200),
	"price_cents" integer DEFAULT 0 NOT NULL,
	"currency" "contract_currency" DEFAULT 'MDL' NOT NULL,
	"persons" integer DEFAULT 1 NOT NULL,
	"lead_id" uuid,
	"student_id" uuid,
	"pdf_url" varchar(1000),
	"data" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "contracts" ADD CONSTRAINT "contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "contracts" ADD CONSTRAINT "contracts_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "contracts" ADD CONSTRAINT "contracts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_tenant_idx" ON "contracts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_tenant_date_idx" ON "contracts" USING btree ("tenant_id","contract_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_number_idx" ON "contracts" USING btree ("tenant_id","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_lead_idx" ON "contracts" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contracts_student_idx" ON "contracts" USING btree ("student_id");