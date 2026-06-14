-- PAR-001: Payment Action Request workflow — core schema (all tables)
-- CORE: backlog/par/PAR-CORE.md §2
-- Enums: par_purpose, par_charge_to, par_status, par_decision, par_role, par_attachment_kind
-- Tables: par_members, par_departments, par_projects, par_budget_codes, par_vendors,
--         par_settings, par_doa_matrix, par_requests, par_line_items, par_approvals,
--         par_attachments, par_payments, par_audit

CREATE TYPE "public"."par_purpose" AS ENUM('execute_payment', 'obtain_quotations', 'provide_estimate');
--> statement-breakpoint
CREATE TYPE "public"."par_charge_to" AS ENUM('operations', 'program', 'other');
--> statement-breakpoint
CREATE TYPE "public"."par_status" AS ENUM('draft', 'pending_approval', 'changes_requested', 'rejected', 'approved', 'in_finance', 'reapproval_required', 'paid', 'cancelled');
--> statement-breakpoint
CREATE TYPE "public"."par_decision" AS ENUM('pending', 'approved', 'rejected', 'changes_requested');
--> statement-breakpoint
CREATE TYPE "public"."par_role" AS ENUM('requestor', 'approver', 'finance', 'par_admin');
--> statement-breakpoint
CREATE TYPE "public"."par_attachment_kind" AS ENUM('act_of_receipt', 'contract', 'quotation', 'invoice', 'par_pdf', 'other');
--> statement-breakpoint
CREATE TABLE "par_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "par_role" NOT NULL,
  "approval_limit_cents" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "par_departments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "par_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "donor" varchar(200),
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "par_budget_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" varchar(50) NOT NULL,
  "name" varchar(200) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "par_vendors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(300) NOT NULL,
  "idnp" varchar(13),
  "iban" varchar(34),
  "bank" varchar(300),
  "notes" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "par_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL UNIQUE REFERENCES "tenants"("id") ON DELETE CASCADE,
  "micro_purchase_threshold_cents" integer DEFAULT 1000000 NOT NULL,
  "default_currency" varchar(3) DEFAULT 'MDL' NOT NULL,
  "org_legal_name" varchar(300),
  "org_logo_url" varchar(1000),
  "pdf_help_url" varchar(1000),
  "request_no_prefix" varchar(20) DEFAULT 'PAR' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "par_doa_matrix" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "charge_to" "par_charge_to",
  "department_id" uuid REFERENCES "par_departments"("id") ON DELETE SET NULL,
  "min_amount_cents" integer DEFAULT 0 NOT NULL,
  "max_amount_cents" integer,
  "step" integer NOT NULL,
  "approver_role_label" varchar(200) NOT NULL,
  "approver_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approver_par_role" "par_role",
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "par_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "request_no" varchar(50) NOT NULL,
  "date_of_request" timestamp with time zone DEFAULT now() NOT NULL,
  "requested_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "requestor_title" varchar(300),
  "department_id" uuid REFERENCES "par_departments"("id") ON DELETE SET NULL,
  "date_needed" timestamp with time zone,
  "project_id" uuid REFERENCES "par_projects"("id") ON DELETE SET NULL,
  "budget_code_id" uuid REFERENCES "par_budget_codes"("id") ON DELETE SET NULL,
  "budget_code_note" text,
  "purpose" "par_purpose" DEFAULT 'execute_payment' NOT NULL,
  "charge_to" "par_charge_to" DEFAULT 'program' NOT NULL,
  "charge_billing_code" varchar(100),
  "end_use" text,
  "vendor_id" uuid REFERENCES "par_vendors"("id") ON DELETE SET NULL,
  "payee_name" varchar(300),
  "payee_idnp" varchar(13),
  "payee_iban" varchar(34),
  "payee_bank" varchar(300),
  "attachments_present" boolean DEFAULT false NOT NULL,
  "attachments_note" text,
  "currency" varchar(3) DEFAULT 'MDL' NOT NULL,
  "total_estimated_cents" integer DEFAULT 0 NOT NULL,
  "status" "par_status" DEFAULT 'draft' NOT NULL,
  "submitted_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "par_line_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "par_id" uuid NOT NULL REFERENCES "par_requests"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "description" text NOT NULL,
  "quantity" integer NOT NULL,
  "unit" varchar(50),
  "unit_price_cents" integer NOT NULL,
  "line_total_cents" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "par_approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "par_id" uuid NOT NULL REFERENCES "par_requests"("id") ON DELETE CASCADE,
  "step" integer NOT NULL,
  "approver_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "approver_role_label" varchar(200),
  "decision" "par_decision" DEFAULT 'pending' NOT NULL,
  "decided_at" timestamp with time zone,
  "comment" text,
  "signature_name" varchar(300),
  "signature_title" varchar(300),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "par_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "par_id" uuid NOT NULL REFERENCES "par_requests"("id") ON DELETE CASCADE,
  "file_url" varchar(2000) NOT NULL,
  "file_name" varchar(500) NOT NULL,
  "kind" "par_attachment_kind" DEFAULT 'other' NOT NULL,
  "uploaded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "par_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "par_id" uuid NOT NULL UNIQUE REFERENCES "par_requests"("id") ON DELETE CASCADE,
  "par_bl" varchar(200),
  "received_at" timestamp with time zone,
  "received_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "assigned_to_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "actual_amount_cents" integer,
  "payment_date" timestamp with time zone,
  "payment_ref" varchar(500),
  "proof_url" varchar(2000),
  "overage_reapproved" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "par_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "par_id" uuid NOT NULL REFERENCES "par_requests"("id") ON DELETE CASCADE,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "event" varchar(100) NOT NULL,
  "detail" text,
  "diff" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "par_members_tenant_idx" ON "par_members" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_members_user_idx" ON "par_members" ("user_id");
--> statement-breakpoint
CREATE INDEX "par_departments_tenant_idx" ON "par_departments" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_projects_tenant_idx" ON "par_projects" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_budget_codes_tenant_idx" ON "par_budget_codes" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_vendors_tenant_idx" ON "par_vendors" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_settings_tenant_idx" ON "par_settings" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_doa_matrix_tenant_idx" ON "par_doa_matrix" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_requests_tenant_idx" ON "par_requests" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_requests_status_idx" ON "par_requests" ("status");
--> statement-breakpoint
CREATE INDEX "par_requests_requested_by_idx" ON "par_requests" ("requested_by_user_id");
--> statement-breakpoint
CREATE INDEX "par_line_items_par_idx" ON "par_line_items" ("par_id");
--> statement-breakpoint
CREATE INDEX "par_line_items_tenant_idx" ON "par_line_items" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_approvals_par_idx" ON "par_approvals" ("par_id");
--> statement-breakpoint
CREATE INDEX "par_approvals_tenant_idx" ON "par_approvals" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_approvals_decision_idx" ON "par_approvals" ("decision");
--> statement-breakpoint
CREATE INDEX "par_attachments_par_idx" ON "par_attachments" ("par_id");
--> statement-breakpoint
CREATE INDEX "par_attachments_tenant_idx" ON "par_attachments" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_payments_par_idx" ON "par_payments" ("par_id");
--> statement-breakpoint
CREATE INDEX "par_payments_tenant_idx" ON "par_payments" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_audit_par_idx" ON "par_audit" ("par_id");
--> statement-breakpoint
CREATE INDEX "par_audit_tenant_idx" ON "par_audit" ("tenant_id");
