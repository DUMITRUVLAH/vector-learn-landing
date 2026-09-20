ALTER TABLE "par_drive_connections" ADD COLUMN IF NOT EXISTS "archive_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "par_drive_connections" ADD COLUMN IF NOT EXISTS "archive_interval_days" integer DEFAULT 14 NOT NULL;
--> statement-breakpoint
ALTER TABLE "par_drive_connections" ADD COLUMN IF NOT EXISTS "last_archive_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "par_drive_archives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"label" varchar(40) NOT NULL,
	"folder_id" varchar(200),
	"manifest_file_id" varchar(200),
	"file_count" integer DEFAULT 0 NOT NULL,
	"locked_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'ok' NOT NULL,
	"message" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_drive_archives_tenant_idx" ON "par_drive_archives" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_drive_archives_tenant_label_uniq" ON "par_drive_archives" ("tenant_id","label");
