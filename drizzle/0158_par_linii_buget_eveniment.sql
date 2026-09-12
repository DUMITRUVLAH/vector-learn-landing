-- VM5-20: bugetul evenimentului pe linii (cod bugetar × sumă × monedă).
-- Totalul evenimentului se calculează din linii; nu există coloană separată de total, ca cele două
-- să nu poată ieși din sincron.
CREATE TABLE IF NOT EXISTS "par_event_budget_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "budget_code_id" uuid,
  "label" varchar(300),
  "allocated_cents" integer DEFAULT 0 NOT NULL,
  "currency" varchar(3) DEFAULT 'MDL' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "par_event_budget_lines" ADD CONSTRAINT "par_event_budget_lines_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "par_event_budget_lines" ADD CONSTRAINT "par_event_budget_lines_event_id_par_events_id_fk"
    FOREIGN KEY ("event_id") REFERENCES "public"."par_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "par_event_budget_lines" ADD CONSTRAINT "par_event_budget_lines_budget_code_id_par_budget_codes_id_fk"
    FOREIGN KEY ("budget_code_id") REFERENCES "public"."par_budget_codes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_event_budget_lines_tenant_idx" ON "par_event_budget_lines" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_event_budget_lines_event_idx" ON "par_event_budget_lines" ("event_id");
