DO $$
BEGIN
  CREATE TYPE "payment_plan_status" AS ENUM ('active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "description" varchar(500),
  "total_amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'RON',
  "installments_count" integer NOT NULL,
  "interval_days" integer NOT NULL DEFAULT 30,
  "status" "payment_plan_status" NOT NULL DEFAULT 'active',
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_plans_tenant_idx" ON "payment_plans"("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_plans_student_idx" ON "payment_plans"("student_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_plans_status_idx" ON "payment_plans"("tenant_id", "status");
