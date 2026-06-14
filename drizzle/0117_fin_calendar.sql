-- CALENDAR-001 (FIN): Calendar Fiscal — obligații + blocare perioade
-- fin_obligations: obligații fiscale/de plată ale tenantului (TVA, CAS, CNAM, salariu)
-- fin_period_locks: perioadele contabile blocate (FIN-CORE regula #8: imutabilitate)
-- Migration prefix 0115 — > max 0114 pe origin/main (migration-prefix-collision mitigation)
-- obligation_type și status: VARCHAR (nu pgEnum) → portabilitate PGlite↔Postgres

-- fin_obligations
CREATE TABLE "fin_obligations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "obligation_type" varchar(50) NOT NULL,
    "description" varchar(500),
    "period_year" integer NOT NULL,
    "period_month" integer NOT NULL,
    "due_date" date NOT NULL,
    "amount_cents" bigint NOT NULL DEFAULT 0,
    "currency" char(3) NOT NULL DEFAULT 'MDL',
    "status" varchar(20) NOT NULL DEFAULT 'pending',
    "paid_at" timestamp with time zone,
    "declaration_id" uuid,
    "notes" text,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "fob_tenant_idx" ON "fin_obligations" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "fob_tenant_year_month_idx" ON "fin_obligations" ("tenant_id", "period_year", "period_month");
--> statement-breakpoint
CREATE INDEX "fob_due_date_idx" ON "fin_obligations" ("due_date");
--> statement-breakpoint

-- fin_period_locks
CREATE TABLE "fin_period_locks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "period_year" integer NOT NULL,
    "period_month" integer NOT NULL,
    "locked_at" timestamp with time zone NOT NULL DEFAULT now(),
    "locked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "notes" text
);
--> statement-breakpoint
CREATE INDEX "fpl_tenant_idx" ON "fin_period_locks" ("tenant_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "fpl_tenant_year_month_uniq" ON "fin_period_locks" ("tenant_id", "period_year", "period_month");
