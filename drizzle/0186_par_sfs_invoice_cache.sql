CREATE TABLE IF NOT EXISTS "par_sfs_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"seria" varchar(20) NOT NULL,
	"number" varchar(50) NOT NULL,
	"invoice_status" integer DEFAULT 0 NOT NULL,
	"supplier_idno" varchar(50),
	"supplier_name" varchar(300),
	"buyer_idno" varchar(50),
	"invoice_date" timestamp with time zone,
	"total_cents" integer,
	"portal_url" text,
	"details_fetched_at" timestamp with time zone,
	"detail_attempts" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_sfs_invoices_tenant_key_uniq" ON "par_sfs_invoices" ("tenant_id","seria","number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_sfs_invoices_tenant_date_idx" ON "par_sfs_invoices" ("tenant_id","invoice_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_sfs_invoices_tenant_supplier_idx" ON "par_sfs_invoices" ("tenant_id","supplier_idno");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_sfs_invoices_pending_idx" ON "par_sfs_invoices" ("tenant_id","details_fetched_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_sfs_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"heads_synced_at" timestamp with time zone,
	"archive_cursor_to" timestamp with time zone,
	"archive_done_at" timestamp with time zone,
	"last_batch_at" timestamp with time zone,
	"last_message" text,
	"last_error" text,
	"running_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_sfs_sync_state_tenant_uniq" ON "par_sfs_sync_state" ("tenant_id");
