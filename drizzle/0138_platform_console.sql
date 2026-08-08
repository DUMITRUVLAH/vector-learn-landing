-- PLATFORM-001 — Consola Platformă (superadmin): module per workspace, istoric logări,
-- audit al acțiunilor de superadmin, note interne, ciclu de viață al workspace-ului.
--
-- Fail-open by design: lipsa unui rând în tenant_modules înseamnă "modul vizibil".
-- Backfill-ul de la final scrie explicit enabled=true pentru workspace-urile EXISTENTE,
-- ca activarea funcționalității să nu ia nimănui acces la ce vedea ieri.

CREATE TABLE IF NOT EXISTS "platform_module_defaults" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "module_key" varchar(50) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_module_defaults_key_uniq" ON "platform_module_defaults" ("module_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_modules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "module_key" varchar(50) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "updated_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_modules_tenant_idx" ON "tenant_modules" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_modules_tenant_key_uniq" ON "tenant_modules" ("tenant_id","module_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE set null,
  "email" varchar(255) NOT NULL,
  "app" varchar(20) DEFAULT 'business' NOT NULL,
  "method" varchar(20) DEFAULT 'password' NOT NULL,
  "success" boolean NOT NULL,
  "failure_reason" varchar(60),
  "ip_address" varchar(64),
  "user_agent" varchar(512),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_events_created_idx" ON "login_events" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_events_tenant_idx" ON "login_events" ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_events_user_idx" ON "login_events" ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "login_events_email_idx" ON "login_events" ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "actor_email" varchar(255),
  "action" varchar(60) NOT NULL,
  "target_type" varchar(40),
  "target_id" varchar(100),
  "target_label" varchar(300),
  "meta" jsonb,
  "ip_address" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_audit_log_created_idx" ON "platform_audit_log" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_audit_log_target_idx" ON "platform_audit_log" ("target_type","target_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "author_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "author_email" varchar(255),
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_notes_tenant_idx" ON "tenant_notes" ("tenant_id","created_at");
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "status" varchar(20) DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "suspended_reason" varchar(300);
--> statement-breakpoint
-- Implicitele pentru workspace-uri NOI. Pornim cu tot pornit = comportamentul de azi;
-- proprietarul le restrânge din UI, deliberat, nu ca efect secundar al acestui deploy.
INSERT INTO "platform_module_defaults" ("module_key", "enabled")
SELECT v.k, true FROM (VALUES ('findesk'), ('par'), ('itpark'), ('docmerge')) AS v(k)
ON CONFLICT ("module_key") DO NOTHING;
--> statement-breakpoint
-- Backfill: fiecare workspace EXISTENT primește rânduri explicite enabled=true, deci
-- schimbarea implicitelor de mai târziu nu afectează retroactiv clienții actuali.
INSERT INTO "tenant_modules" ("tenant_id", "module_key", "enabled")
SELECT t."id", v.k, true FROM "tenants" t
CROSS JOIN (VALUES ('findesk'), ('par'), ('itpark'), ('docmerge')) AS v(k)
ON CONFLICT ("tenant_id", "module_key") DO NOTHING;
