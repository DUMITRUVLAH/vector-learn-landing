-- PAR modernization: workspace → payer → project, member defaults and project scope.
-- Existing tenants receive a single default payer so historical PARs remain visible unchanged.

CREATE TABLE "par_payers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" varchar(300) NOT NULL,
  "legal_name" varchar(300),
  "idno" varchar(32),
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "par_payers_tenant_idx" ON "par_payers" ("tenant_id");
--> statement-breakpoint
CREATE TABLE "platform_admins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_admins_user_uniq" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "par_payer_modules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "payer_id" uuid NOT NULL REFERENCES "par_payers"("id") ON DELETE cascade,
  "module_key" varchar(50) NOT NULL,
  "enabled" boolean NOT NULL DEFAULT false,
  "updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "par_payer_modules_payer_key_uniq" UNIQUE("payer_id", "module_key")
);
--> statement-breakpoint
CREATE INDEX "par_payer_modules_payer_idx" ON "par_payer_modules" ("payer_id");
--> statement-breakpoint
CREATE TABLE "par_payer_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "payer_id" uuid NOT NULL REFERENCES "par_payers"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "par_payer_members_payer_user_uniq" UNIQUE("payer_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX "par_payer_members_payer_idx" ON "par_payer_members" ("payer_id");
--> statement-breakpoint
CREATE INDEX "par_payer_members_user_idx" ON "par_payer_members" ("tenant_id", "user_id");
--> statement-breakpoint
CREATE TABLE "par_member_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "department_id" uuid REFERENCES "par_departments"("id") ON DELETE set null,
  "job_title" varchar(300),
  "staff_code" varchar(100),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "par_member_profiles_tenant_user_uniq" UNIQUE("tenant_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX "par_member_profiles_tenant_idx" ON "par_member_profiles" ("tenant_id");
--> statement-breakpoint
ALTER TABLE "par_projects" ADD COLUMN "payer_id" uuid REFERENCES "par_payers"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "par_budget_codes" ADD COLUMN "payer_id" uuid REFERENCES "par_payers"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "par_budget_codes" ADD COLUMN "project_id" uuid REFERENCES "par_projects"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN "payer_id" uuid REFERENCES "par_payers"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN "requestor_code" varchar(100);
--> statement-breakpoint
ALTER TABLE "par_doa_matrix" ADD COLUMN "payer_id" uuid REFERENCES "par_payers"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "par_doa_matrix" ADD COLUMN "project_id" uuid REFERENCES "par_projects"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "par_doa_matrix" ADD COLUMN "approval_mode" varchar(20) NOT NULL DEFAULT 'sequential';
--> statement-breakpoint
CREATE INDEX "par_projects_payer_idx" ON "par_projects" ("payer_id");
--> statement-breakpoint
CREATE INDEX "par_budget_codes_payer_idx" ON "par_budget_codes" ("payer_id");
--> statement-breakpoint
CREATE INDEX "par_budget_codes_project_idx" ON "par_budget_codes" ("project_id");
--> statement-breakpoint
CREATE INDEX "par_requests_payer_idx" ON "par_requests" ("payer_id");
--> statement-breakpoint
CREATE TABLE "par_project_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "project_id" uuid NOT NULL REFERENCES "par_projects"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "par_project_members_project_user_uniq" UNIQUE("project_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX "par_project_members_project_idx" ON "par_project_members" ("project_id");
--> statement-breakpoint
CREATE INDEX "par_project_members_user_idx" ON "par_project_members" ("tenant_id", "user_id");
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN "bic_swift" varchar(32);
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN "bank_account" varchar(100);
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN "bank_account_currency" varchar(3);
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN "legal_address" text;
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN "contact_name" varchar(300);
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN "contact_phone" varchar(100);
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN "contact_email" varchar(255);
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN "administrator_name" varchar(300);
--> statement-breakpoint
ALTER TABLE "par_attachments" ADD COLUMN "analysis" text;
--> statement-breakpoint
ALTER TABLE "par_invites" ADD COLUMN "payer_scope" text;
--> statement-breakpoint
INSERT INTO "par_payers" ("tenant_id", "name", "legal_name")
SELECT t."id", t."name", t."name"
FROM "tenants" t
WHERE NOT EXISTS (SELECT 1 FROM "par_payers" p WHERE p."tenant_id" = t."id");
--> statement-breakpoint
UPDATE "par_projects" p SET "payer_id" = x."id"
FROM (SELECT DISTINCT ON ("tenant_id") "id", "tenant_id" FROM "par_payers" ORDER BY "tenant_id", "created_at") x
WHERE p."tenant_id" = x."tenant_id" AND p."payer_id" IS NULL;
--> statement-breakpoint
UPDATE "par_budget_codes" b SET "payer_id" = x."id"
FROM (SELECT DISTINCT ON ("tenant_id") "id", "tenant_id" FROM "par_payers" ORDER BY "tenant_id", "created_at") x
WHERE b."tenant_id" = x."tenant_id" AND b."payer_id" IS NULL;
--> statement-breakpoint
UPDATE "par_requests" r SET "payer_id" = x."id"
FROM (SELECT DISTINCT ON ("tenant_id") "id", "tenant_id" FROM "par_payers" ORDER BY "tenant_id", "created_at") x
WHERE r."tenant_id" = x."tenant_id" AND r."payer_id" IS NULL;
--> statement-breakpoint
-- Preserve existing access on rollout. New users are deliberately unassigned until an admin scopes them.
INSERT INTO "par_project_members" ("tenant_id", "project_id", "user_id")
SELECT DISTINCT m."tenant_id", p."id", m."user_id"
FROM "par_members" m
JOIN "par_projects" p ON p."tenant_id" = m."tenant_id"
ON CONFLICT ("project_id", "user_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "par_payer_members" ("tenant_id", "payer_id", "user_id")
SELECT DISTINCT m."tenant_id", p."id", m."user_id"
FROM "par_members" m
JOIN "par_payers" p ON p."tenant_id" = m."tenant_id"
ON CONFLICT ("payer_id", "user_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "par_payer_modules" ("tenant_id", "payer_id", "module_key", "enabled")
SELECT "tenant_id", "id", m."module_key", true
FROM "par_payers" CROSS JOIN (VALUES ('par'), ('findesk')) AS m("module_key")
ON CONFLICT ("payer_id", "module_key") DO NOTHING;
