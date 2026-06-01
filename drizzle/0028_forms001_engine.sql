-- FORMS-001: Motor de formulare generice cu mapare câmp→lead
-- Enum-urile sunt înfășurate în DO $$ ... duplicate_object guard (idempotent pe Postgres real).

DO $$ BEGIN
  CREATE TYPE "public"."form_field_type" AS ENUM(
    'short_text',
    'long_text',
    'email',
    'phone',
    'number',
    'single_choice',
    'multiple_choice',
    'dropdown',
    'rating',
    'yes_no',
    'date',
    'consent',
    'hidden'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."form_status" AS ENUM(
    'draft',
    'published',
    'closed'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."form_submission_status" AS ENUM(
    'partial',
    'complete'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "forms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "title" varchar(200) NOT NULL,
  "slug" varchar(100) NOT NULL,
  "status" "form_status" NOT NULL DEFAULT 'draft',
  "description" varchar(1000),
  "thank_you_message" varchar(500),
  "redirect_url" varchar(1000),
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "form_fields" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "form_id" uuid NOT NULL,
  "type" "form_field_type" NOT NULL,
  "label" varchar(500) NOT NULL,
  "placeholder" varchar(500),
  "required" boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL DEFAULT 0,
  "options" jsonb,
  "lead_mapping" varchar(50),
  "hidden" boolean NOT NULL DEFAULT false,
  "hidden_source_param" varchar(100),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "form_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "form_id" uuid NOT NULL,
  "answers" jsonb NOT NULL,
  "lead_id" uuid,
  "utm" jsonb,
  "status" "form_submission_status" NOT NULL DEFAULT 'complete',
  "ip" varchar(64),
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "forms"
  ADD CONSTRAINT "forms_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "forms"
  ADD CONSTRAINT "forms_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "form_fields"
  ADD CONSTRAINT "form_fields_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "form_fields"
  ADD CONSTRAINT "form_fields_form_id_forms_id_fk"
  FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "form_submissions"
  ADD CONSTRAINT "form_submissions_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "form_submissions"
  ADD CONSTRAINT "form_submissions_form_id_forms_id_fk"
  FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "form_submissions"
  ADD CONSTRAINT "form_submissions_lead_id_leads_id_fk"
  FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "forms_tenant_idx" ON "forms" USING btree ("tenant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "forms_slug_tenant_idx" ON "forms" USING btree ("tenant_id", "slug");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "form_fields_tenant_form_idx" ON "form_fields" USING btree ("tenant_id", "form_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "form_submissions_tenant_idx" ON "form_submissions" USING btree ("tenant_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "form_submissions_form_idx" ON "form_submissions" USING btree ("form_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "form_submissions_lead_idx" ON "form_submissions" USING btree ("lead_id");
