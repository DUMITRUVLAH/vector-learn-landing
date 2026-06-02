DO $$ BEGIN
  CREATE TYPE "public"."payment_account_status" AS ENUM('draft', 'issued', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seller_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"idno" varchar(32),
	"legal_form" varchar(255),
	"vat_code" varchar(32),
	"address" varchar(500),
	"city" varchar(255),
	"iban" varchar(34),
	"bank_name" varchar(255),
	"bank_code" varchar(32),
	"contact_email" varchar(255),
	"contact_phone" varchar(64),
	"default_series" varchar(20) DEFAULT 'CP' NOT NULL,
	"default_vat_rate" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"idno" varchar(32),
	"name" varchar(500) NOT NULL,
	"legal_form" varchar(255),
	"status" varchar(64),
	"address" varchar(500),
	"city" varchar(255),
	"cuatm_code" varchar(32),
	"email" varchar(255),
	"phone" varchar(64),
	"registry_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid,
	"series" varchar(20) DEFAULT 'CP' NOT NULL,
	"number" integer,
	"document_number" varchar(40),
	"status" "payment_account_status" DEFAULT 'draft' NOT NULL,
	"currency" varchar(3) DEFAULT 'MDL' NOT NULL,
	"issue_date" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"seller_name" varchar(255) NOT NULL,
	"seller_idno" varchar(32),
	"seller_vat_code" varchar(32),
	"seller_address" varchar(500),
	"seller_iban" varchar(34),
	"seller_bank_name" varchar(255),
	"seller_bank_code" varchar(32),
	"buyer_name" varchar(500) NOT NULL,
	"buyer_idno" varchar(32),
	"buyer_address" varchar(500),
	"buyer_city" varchar(255),
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"vat_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"pdf_key" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_account_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" varchar(500) NOT NULL,
	"unit" varchar(32) DEFAULT 'buc' NOT NULL,
	"quantity" numeric(12, 3) DEFAULT '1' NOT NULL,
	"unit_price_cents" integer DEFAULT 0 NOT NULL,
	"vat_rate" integer DEFAULT 20 NOT NULL,
	"line_subtotal_cents" integer DEFAULT 0 NOT NULL,
	"line_vat_cents" integer DEFAULT 0 NOT NULL,
	"line_total_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "seller_profiles" ADD CONSTRAINT "seller_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "company_clients" ADD CONSTRAINT "company_clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_client_id_company_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."company_clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payment_account_items" ADD CONSTRAINT "payment_account_items_account_id_payment_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."payment_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seller_profiles_tenant_idx" ON "seller_profiles" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_clients_tenant_idx" ON "company_clients" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_clients_tenant_idno_idx" ON "company_clients" USING btree ("tenant_id","idno");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_accounts_tenant_idx" ON "payment_accounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_accounts_status_idx" ON "payment_accounts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_accounts_number_idx" ON "payment_accounts" USING btree ("tenant_id","series","number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_accounts_client_idx" ON "payment_accounts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_account_items_account_idx" ON "payment_account_items" USING btree ("account_id");
