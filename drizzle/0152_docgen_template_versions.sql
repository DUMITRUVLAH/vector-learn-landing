CREATE TABLE IF NOT EXISTS "doc_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"template_id" uuid NOT NULL REFERENCES "docmerge_templates"("id") ON DELETE cascade,
	"version" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"body_html" text NOT NULL,
	"created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_template_versions_template_idx" ON "doc_template_versions" ("template_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_template_versions_tenant_idx" ON "doc_template_versions" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "doc_template_versions_uniq" ON "doc_template_versions" ("template_id","version");
