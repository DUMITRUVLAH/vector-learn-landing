/**
 * PAR-DRIVE — healul de producție pentru oglinda în Google Drive (migrarea 0159).
 *
 * Aceeași regulă ca la PAR-VENDOR360: Vercel livrează codul înaintea migrărilor, iar evidența
 * drizzle de pe producție e desincronizată. Fără heal, pagina de setări Drive și jobul săptămânal
 * ar răspunde „relation par_drive_connections does not exist". Healul generic din sync-schema.ts
 * adaugă doar COLOANE — tabelele se declară aici, idempotent, un singur statement per element.
 */
export const PAR_DRIVE_ENSURE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "par_drive_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"google_email" varchar(320),
	"refresh_token_enc" text NOT NULL,
	"root_folder_id" varchar(200),
	"root_folder_name" varchar(200) DEFAULT 'Dosare PAR plătite' NOT NULL,
	"connected_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"sync_day_of_week" integer DEFAULT 1 NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" varchar(20),
	"last_sync_message" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "par_drive_connections_tenant_id_unique" UNIQUE("tenant_id")
)`,
  `CREATE INDEX IF NOT EXISTS "par_drive_connections_tenant_idx" ON "par_drive_connections" ("tenant_id")`,
  `CREATE TABLE IF NOT EXISTS "par_drive_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"path_key" varchar(500) NOT NULL,
	"folder_id" varchar(200) NOT NULL,
	"name" varchar(300) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS "par_drive_folders_tenant_idx" ON "par_drive_folders" ("tenant_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "par_drive_folders_tenant_path_uniq" ON "par_drive_folders" ("tenant_id","path_key")`,
  `CREATE TABLE IF NOT EXISTS "par_drive_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"par_id" uuid NOT NULL REFERENCES "par_requests"("id") ON DELETE cascade,
	"drive_file_id" varchar(200),
	"folder_path_key" varchar(500),
	"file_name" varchar(300),
	"content_hash" varchar(64),
	"status" varchar(20) DEFAULT 'synced' NOT NULL,
	"error" varchar(500),
	"attempts" integer DEFAULT 0 NOT NULL,
	"uploaded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS "par_drive_files_tenant_idx" ON "par_drive_files" ("tenant_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "par_drive_files_tenant_par_uniq" ON "par_drive_files" ("tenant_id","par_id")`,
];
