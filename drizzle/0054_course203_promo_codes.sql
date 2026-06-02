DO $$
BEGIN
  CREATE TYPE "public"."discount_type" AS ENUM('percent', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpointDO $$
BEGIN
  CREATE TYPE "public"."promo_status" AS ENUM('active', 'expired', 'exhausted', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"discount_type" "discount_type" NOT NULL,
	"discount_value" integer NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"status" "promo_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "promo_code_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "original_amount_cents" integer;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "payments" ADD CONSTRAINT "payments_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pc_tenant_idx" ON "promo_codes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pc_tenant_code_idx" ON "promo_codes" USING btree ("tenant_id","code");
