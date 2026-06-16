-- PAR port (procure-to-pay): bring the newer PAR from the standalone par-app repo.
-- Adds 8 tables (templates, invites, comments, quotes, purchase orders, receipts,
-- receipt lines, delegations) + 2 multicurrency columns on par_requests (VF-203).
-- See backlog/PAR-PORT-PLAN.md.

ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "exchange_rate" numeric(14, 6);
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN IF NOT EXISTS "total_mdl_cents" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"name" varchar(300) NOT NULL,
	"created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"snapshot" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_templates_tenant_idx" ON "par_templates" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_templates_created_by_idx" ON "par_templates" ("created_by_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"email" varchar(255) NOT NULL,
	"par_role" "par_role" NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"invited_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_invites_tenant_idx" ON "par_invites" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_invites_token_hash_idx" ON "par_invites" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_invites_email_idx" ON "par_invites" ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"par_id" uuid NOT NULL REFERENCES "par_requests"("id") ON DELETE cascade,
	"author_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_comments_par_idx" ON "par_comments" ("par_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_comments_tenant_idx" ON "par_comments" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"par_id" uuid NOT NULL REFERENCES "par_requests"("id") ON DELETE cascade,
	"vendor_id" uuid REFERENCES "par_vendors"("id") ON DELETE set null,
	"vendor_name" varchar(300) NOT NULL,
	"total_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'MDL' NOT NULL,
	"valid_until" timestamp with time zone,
	"notes" text,
	"file_url" text,
	"selected" boolean DEFAULT false NOT NULL,
	"selection_reason" text,
	"created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_quotes_par_idx" ON "par_quotes" ("par_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_quotes_tenant_idx" ON "par_quotes" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"par_id" uuid NOT NULL UNIQUE REFERENCES "par_requests"("id") ON DELETE cascade,
	"po_number" varchar(50) NOT NULL,
	"vendor_name" varchar(300),
	"vendor_idnp" varchar(13),
	"vendor_iban" varchar(34),
	"total_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'MDL' NOT NULL,
	"status" varchar(20) DEFAULT 'issued' NOT NULL,
	"issued_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_po_tenant_idx" ON "par_purchase_orders" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"par_id" uuid NOT NULL REFERENCES "par_requests"("id") ON DELETE cascade,
	"received_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"complete" boolean DEFAULT true NOT NULL,
	"notes" text,
	"file_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_receipts_par_idx" ON "par_receipts" ("par_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_receipts_tenant_idx" ON "par_receipts" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_receipt_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"receipt_id" uuid NOT NULL REFERENCES "par_receipts"("id") ON DELETE cascade,
	"line_item_id" uuid NOT NULL REFERENCES "par_line_items"("id") ON DELETE cascade,
	"qty_received" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_receipt_lines_receipt_idx" ON "par_receipt_lines" ("receipt_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_receipt_lines_tenant_idx" ON "par_receipt_lines" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"from_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"to_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_delegations_tenant_idx" ON "par_delegations" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_delegations_from_idx" ON "par_delegations" ("from_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_delegations_to_idx" ON "par_delegations" ("to_user_id");
