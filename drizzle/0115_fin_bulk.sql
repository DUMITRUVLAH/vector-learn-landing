-- MASS-001 (FIN): FinDesk Bulk Operations schema
-- Tables: fin_bulk_jobs, fin_bulk_rows
-- FIN-CORE §1.15: async bulk job infrastructure
-- Prefix 0115 > max on origin/main (0114).
-- NOTE: collision expected at merge with other FIN branches also using 0115 — renumber then.
-- No Postgres native enums — VARCHAR + code validation for PGlite portability.

CREATE TABLE "fin_bulk_jobs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "job_type" varchar(50) NOT NULL,
    "status" varchar(20) NOT NULL DEFAULT 'pending',
    "total_rows" integer NOT NULL DEFAULT 0,
    "success_rows" integer NOT NULL DEFAULT 0,
    "fail_rows" integer NOT NULL DEFAULT 0,
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "error_message" text,
    "meta" jsonb NOT NULL DEFAULT '{}',
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fin_bulk_rows" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "job_id" uuid NOT NULL REFERENCES "fin_bulk_jobs"("id") ON DELETE CASCADE,
    "row_index" integer NOT NULL,
    "external_ref" varchar(200),
    "status" varchar(20) NOT NULL DEFAULT 'pending',
    "retry_count" integer NOT NULL DEFAULT 0,
    "error_message" text,
    "result_ref" varchar(200),
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "fbj_tenant_idx" ON "fin_bulk_jobs" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "fbj_tenant_status_idx" ON "fin_bulk_jobs" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX "fbj_tenant_type_idx" ON "fin_bulk_jobs" ("tenant_id", "job_type");
--> statement-breakpoint
CREATE INDEX "fbr_job_idx" ON "fin_bulk_rows" ("job_id");
--> statement-breakpoint
CREATE INDEX "fbr_job_status_idx" ON "fin_bulk_rows" ("job_id", "status");
--> statement-breakpoint
ALTER TABLE "fin_bulk_rows" ADD CONSTRAINT "fbr_job_row_unique" UNIQUE ("job_id", "row_index");
