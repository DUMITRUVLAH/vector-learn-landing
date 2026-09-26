-- 0196_cont_plata_personalizabil: contul de plată devine modul CRM — client complet, legături cu
-- catalogul și fișa firmei, setări de design/numerotare pe emitent și șabloane refolosibile.
-- Totul aditiv (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS): prod nu aplică fiabil
-- migrările, iar sync-schema cară aceleași coloane — rularea de două ori nu strică nimic.
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "buyer_vat_code" varchar(32);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "buyer_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "buyer_phone" varchar(64);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "buyer_iban" varchar(34);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "buyer_bank_name" varchar(255);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "buyer_contact" varchar(255);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "crm_company_id" uuid;
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "lead_id" uuid;
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "lang" varchar(2) DEFAULT 'ro' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "template_id" uuid;
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "seller_bic" varchar(11);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "seller_phone" varchar(64);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "seller_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD COLUMN IF NOT EXISTS "seller_administrator" varchar(255);
--> statement-breakpoint
ALTER TABLE "payment_account_items" ADD COLUMN IF NOT EXISTS "product_id" uuid;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "accent_color" varchar(7) DEFAULT '#047857' NOT NULL;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "layout" varchar(20) DEFAULT 'modern' NOT NULL;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "logo_url" text;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "show_logo" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "show_amount_words" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "show_signature" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "show_stamp" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "footer_text" text;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "default_notes" text;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "default_due_days" integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "default_lang" varchar(2) DEFAULT 'ro' NOT NULL;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "number_pattern" varchar(60) DEFAULT '{serie}-{an}-{nr}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "number_pad" integer DEFAULT 4 NOT NULL;
--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN IF NOT EXISTS "number_start" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_account_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"name" varchar(200) NOT NULL,
	"buyer" jsonb,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"currency" varchar(3) DEFAULT 'MDL' NOT NULL,
	"notes" text,
	"due_days" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_account_templates_tenant_idx" ON "payment_account_templates" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_accounts_docnum_uniq" ON "payment_accounts" ("tenant_id","document_number") WHERE "document_number" IS NOT NULL;
