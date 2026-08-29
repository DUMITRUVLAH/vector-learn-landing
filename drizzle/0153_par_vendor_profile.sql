CREATE TABLE IF NOT EXISTS "par_vendor_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"name" varchar(120) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_vendor_categories_tenant_idx" ON "par_vendor_categories" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_vendor_categories_tenant_slug_uniq" ON "par_vendor_categories" ("tenant_id","slug");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_vendor_category_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"vendor_id" uuid NOT NULL REFERENCES "par_vendors"("id") ON DELETE cascade,
	"category_id" uuid NOT NULL REFERENCES "par_vendor_categories"("id") ON DELETE cascade,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_vendor_category_links_vendor_idx" ON "par_vendor_category_links" ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_vendor_category_links_category_idx" ON "par_vendor_category_links" ("category_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_vendor_category_links_pair_uniq" ON "par_vendor_category_links" ("vendor_id","category_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_vendor_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"vendor_id" uuid NOT NULL REFERENCES "par_vendors"("id") ON DELETE cascade,
	"par_id" uuid REFERENCES "par_requests"("id") ON DELETE set null,
	"author_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"stars" integer NOT NULL,
	"quality_stars" integer,
	"timeliness_stars" integer,
	"price_stars" integer,
	"communication_stars" integer,
	"comment" text,
	"would_use_again" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_vendor_ratings_tenant_idx" ON "par_vendor_ratings" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_vendor_ratings_vendor_idx" ON "par_vendor_ratings" ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_vendor_ratings_par_idx" ON "par_vendor_ratings" ("par_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_vendor_ratings_par_author_uniq" ON "par_vendor_ratings" ("par_id","author_user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_vendor_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"vendor_id" uuid NOT NULL REFERENCES "par_vendors"("id") ON DELETE cascade,
	"author_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_vendor_notes_tenant_idx" ON "par_vendor_notes" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_vendor_notes_vendor_idx" ON "par_vendor_notes" ("vendor_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_vendor_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"vendor_id" uuid NOT NULL REFERENCES "par_vendors"("id") ON DELETE cascade,
	"title" varchar(300) NOT NULL,
	"category_id" uuid REFERENCES "par_vendor_categories"("id") ON DELETE set null,
	"amount_cents" integer,
	"currency" varchar(3) DEFAULT 'MDL' NOT NULL,
	"unit_label" varchar(50),
	"unit_price_cents" integer,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"par_id" uuid REFERENCES "par_requests"("id") ON DELETE set null,
	"file_url" text,
	"file_name" varchar(300),
	"notes" text,
	"created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_vendor_offers_tenant_idx" ON "par_vendor_offers" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_vendor_offers_vendor_idx" ON "par_vendor_offers" ("vendor_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_vendor_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"vendor_id" uuid NOT NULL REFERENCES "par_vendors"("id") ON DELETE cascade,
	"kind" varchar(40) DEFAULT 'contract' NOT NULL,
	"title" varchar(300) NOT NULL,
	"number" varchar(100),
	"issued_at" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"file_url" text,
	"file_name" varchar(300),
	"notes" text,
	"created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_vendor_documents_tenant_idx" ON "par_vendor_documents" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_vendor_documents_vendor_idx" ON "par_vendor_documents" ("vendor_id");
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "relationship" varchar(20) DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "blocked_reason" text;
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "website" varchar(300);
--> statement-breakpoint
ALTER TABLE "par_vendors" ADD COLUMN IF NOT EXISTS "payment_terms_days" integer;
