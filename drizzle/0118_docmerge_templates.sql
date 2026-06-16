-- DOCMERGE-001: Document Merge Templates
-- Migration 0118: create docmerge_templates table
CREATE TABLE "docmerge_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(200) NOT NULL,
  "source_format" varchar(20) DEFAULT 'html' NOT NULL,
  "body_html" text NOT NULL,
  "placeholders" text DEFAULT '[]' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "docmerge_templates_tenant_idx" ON "docmerge_templates" ("tenant_id");
