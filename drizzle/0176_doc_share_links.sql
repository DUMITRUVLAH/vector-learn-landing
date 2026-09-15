-- Linkul public al actului (cerința 42 „vizualizată").
--
-- Cheile străine stau în blocuri DO care tolerează ȘI `undefined_table`, nu doar
-- `duplicate_object`: pe o bază pe care migrarea modulului de acte (0151) n-a rulat încă,
-- un `ALTER TABLE ... REFERENCES doc_documents` ar arunca și ar dobora TOATĂ rularea de
-- migrări de la acest punct înainte — clasa de greșeală numărul unu care rupe deploy-ul
-- (CLAUDE.md §3.5.1). Tabela rămâne creată și folosibilă; legătura se pune când există ținta.
CREATE TABLE IF NOT EXISTS "doc_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"first_viewed_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doc_share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "doc_share_links" ADD CONSTRAINT "doc_share_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
 WHEN undefined_table THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "doc_share_links" ADD CONSTRAINT "doc_share_links_document_id_doc_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."doc_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
 WHEN undefined_table THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "doc_share_links" ADD CONSTRAINT "doc_share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
 WHEN undefined_table THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_share_links_tenant_idx" ON "doc_share_links" USING btree ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "doc_share_links_document_uniq" ON "doc_share_links" USING btree ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "doc_share_links_token_idx" ON "doc_share_links" USING btree ("token");
