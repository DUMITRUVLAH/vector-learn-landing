/**
 * PONTAJ-001 — heal pentru tabelele modulului de pontaj.
 *
 * `sync-schema` adaugă generic COLOANE lipsă, dar nu și TABELE, iar producția nu aplică fiabil
 * migrările (vezi comentariul din `server/db/sync-schema.ts`). Fără instrucțiunile de mai jos,
 * primul `GET /api/pontaj/month` după deploy ar da 500 până aterizează migrarea 0184.
 *
 * Toate sunt idempotente (`IF NOT EXISTS`) și non-distructive. O singură instrucțiune per intrare
 * — executorul le rulează una câte una.
 */
export const PONTAJ_ENSURE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "pontaj_org_settings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "country" varchar(8) DEFAULT 'MD' NOT NULL,
    "full_daily_norm_minutes" integer DEFAULT 480 NOT NULL,
    "work_weekdays" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
    "unit_name" varchar(300),
    "subdivision_name" varchar(300),
    "updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "pontaj_org_settings_tenant_uniq" ON "pontaj_org_settings" ("tenant_id")`,
  `CREATE TABLE IF NOT EXISTS "pontaj_profiles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "daily_minutes" integer DEFAULT 480 NOT NULL,
    "job_title" varchar(300),
    "staff_code" varchar(60),
    "reduced_schedule" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "pontaj_profiles_tenant_user_uniq" ON "pontaj_profiles" ("tenant_id","user_id")`,
  `CREATE INDEX IF NOT EXISTS "pontaj_profiles_tenant_idx" ON "pontaj_profiles" ("tenant_id")`,
  `CREATE TABLE IF NOT EXISTS "pontaj_holidays" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "holiday_date" date NOT NULL,
    "name" varchar(200) NOT NULL,
    "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "pontaj_holidays_tenant_date_uniq" ON "pontaj_holidays" ("tenant_id","holiday_date")`,
  `CREATE INDEX IF NOT EXISTS "pontaj_holidays_tenant_idx" ON "pontaj_holidays" ("tenant_id")`,
  `CREATE TABLE IF NOT EXISTS "pontaj_leaves" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "symbol" varchar(4) NOT NULL,
    "start_date" date NOT NULL,
    "end_date" date NOT NULL,
    "note" varchar(500),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "pontaj_leaves_tenant_user_idx" ON "pontaj_leaves" ("tenant_id","user_id")`,
  `CREATE INDEX IF NOT EXISTS "pontaj_leaves_range_idx" ON "pontaj_leaves" ("tenant_id","user_id","start_date","end_date")`,
  `CREATE TABLE IF NOT EXISTS "pontaj_day_entries" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
    "entry_date" date NOT NULL,
    "symbol" varchar(4) NOT NULL,
    "minutes" integer DEFAULT 0 NOT NULL,
    "note" varchar(300),
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
  )`,
  // Indexul unic NU e doar performanță: `onConflictDoUpdate` din ruta de zi îl cere ca țintă.
  // Fără el, a doua corecție pe aceeași zi ar insera un al doilea rând, iar luna ar arăta
  // aleatoriu care din ele — fără nicio eroare.
  `CREATE UNIQUE INDEX IF NOT EXISTS "pontaj_day_entries_user_date_uniq" ON "pontaj_day_entries" ("tenant_id","user_id","entry_date")`,
  `CREATE INDEX IF NOT EXISTS "pontaj_day_entries_month_idx" ON "pontaj_day_entries" ("tenant_id","user_id","entry_date")`,
];
