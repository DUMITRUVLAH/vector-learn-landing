-- PAY-001: Tenant invoice settings (prefix, IBAN, BIC)
-- FORMS-004: form_logic table (idempotent — hand-crafted 0029 may have already created it)
-- FORMS-005: forms analytics columns (idempotent)

CREATE TABLE IF NOT EXISTS "form_logic" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"form_id" uuid NOT NULL,
	"from_field_id" uuid NOT NULL,
	"condition" jsonb NOT NULL,
	"action" varchar(50) NOT NULL,
	"target_field_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "invoice_prefix" varchar(20) DEFAULT 'VECT' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "iban" varchar(34);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "bic" varchar(11);--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "views" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "starts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN IF NOT EXISTS "completions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "form_logic" ADD CONSTRAINT "form_logic_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "form_logic" ADD CONSTRAINT "form_logic_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "form_logic" ADD CONSTRAINT "form_logic_from_field_id_form_fields_id_fk" FOREIGN KEY ("from_field_id") REFERENCES "public"."form_fields"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  ALTER TABLE "form_logic" ADD CONSTRAINT "form_logic_target_field_id_form_fields_id_fk" FOREIGN KEY ("target_field_id") REFERENCES "public"."form_fields"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_logic_form_idx" ON "form_logic" USING btree ("form_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_logic_tenant_idx" ON "form_logic" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "form_logic_from_field_idx" ON "form_logic" USING btree ("from_field_id");
