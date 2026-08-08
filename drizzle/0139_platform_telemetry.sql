-- PLATFORM-002 — telemetrie de erori + semnale de creștere.
-- `error_groups` grupează după amprentă (o linie per tip de eroare), `error_events`
-- păstrează fiecare apariție cu contextul ei. Coloanele noi de pe `tenants` răspund la
-- „de unde a venit clientul" și „a făcut vreodată ceva real cu produsul".

CREATE TABLE IF NOT EXISTS "error_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fingerprint" varchar(64) NOT NULL,
  "kind" varchar(30) NOT NULL,
  "title" varchar(300) NOT NULL,
  "location" varchar(300),
  "occurrences" integer DEFAULT 1 NOT NULL,
  "affected_tenants" integer DEFAULT 0 NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" varchar(20) DEFAULT 'open' NOT NULL,
  "resolved_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "resolved_at" timestamp with time zone,
  "alerted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "error_groups_fingerprint_uniq" ON "error_groups" ("fingerprint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_groups_last_seen_idx" ON "error_groups" ("last_seen_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_groups_status_idx" ON "error_groups" ("status","last_seen_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "error_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id" uuid REFERENCES "error_groups"("id") ON DELETE cascade,
  "fingerprint" varchar(64) NOT NULL,
  "kind" varchar(30) NOT NULL,
  "message" text NOT NULL,
  "stack" text,
  "location" varchar(300),
  "method" varchar(10),
  "status_code" integer,
  "url" varchar(1000),
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE set null,
  "user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "user_email" varchar(255),
  "user_agent" varchar(512),
  "ip_address" varchar(64),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_group_idx" ON "error_events" ("group_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_created_idx" ON "error_events" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "error_events_tenant_idx" ON "error_events" ("tenant_id","created_at");
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "signup_source" varchar(100);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "signup_medium" varchar(100);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "signup_campaign" varchar(150);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "signup_referrer" varchar(500);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "activated_at" timestamp with time zone;
