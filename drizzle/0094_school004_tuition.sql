DO $$
BEGIN
  CREATE TYPE "public"."billing_cycle" AS ENUM('annual', 'per_term', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tuition_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'RON' NOT NULL,
	"billing_cycle" "billing_cycle" DEFAULT 'annual' NOT NULL,
	"sibling_discount_percent" numeric(4, 1) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tuition_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"order_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tuition_installments_plan_order_unique" UNIQUE("plan_id","order_index")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_tuition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"class_id" uuid,
	"sibling_rank" integer DEFAULT 1 NOT NULL,
	"scholarship_amount_cents" integer DEFAULT 0 NOT NULL,
	"scholarship_percent" numeric(4, 1) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_tuition_student_plan_unique" UNIQUE("student_id","plan_id")
);
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tuition_plans" ADD CONSTRAINT "tuition_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tuition_plans" ADD CONSTRAINT "tuition_plans_academic_year_id_academic_years_id_fk" FOREIGN KEY ("academic_year_id") REFERENCES "public"."academic_years"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tuition_installments" ADD CONSTRAINT "tuition_installments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "tuition_installments" ADD CONSTRAINT "tuition_installments_plan_id_tuition_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."tuition_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "student_tuition" ADD CONSTRAINT "student_tuition_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "student_tuition" ADD CONSTRAINT "student_tuition_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "student_tuition" ADD CONSTRAINT "student_tuition_plan_id_tuition_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."tuition_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "student_tuition" ADD CONSTRAINT "student_tuition_class_id_school_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."school_classes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tuition_plans_tenant_year_idx" ON "tuition_plans" USING btree ("tenant_id","academic_year_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tuition_installments_tenant_plan_idx" ON "tuition_installments" USING btree ("tenant_id","plan_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_tuition_tenant_student_idx" ON "student_tuition" USING btree ("tenant_id","student_id");
