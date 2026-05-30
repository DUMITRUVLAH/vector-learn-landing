-- CRM-126: Follow-up cadence tables
-- Migration prefix: 0009 (avoids collision with 0008_neat_shatterstar)

CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'paused', 'completed', 'cancelled');--> statement-breakpoint

CREATE TABLE "cadences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"trigger_stage" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"steps" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "lead_cadence_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"cadence_id" uuid NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"next_fire_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "cadences" ADD CONSTRAINT "cadences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_cadence_enrollments" ADD CONSTRAINT "lead_cadence_enrollments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_cadence_enrollments" ADD CONSTRAINT "lead_cadence_enrollments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_cadence_enrollments" ADD CONSTRAINT "lead_cadence_enrollments_cadence_id_cadences_id_fk" FOREIGN KEY ("cadence_id") REFERENCES "public"."cadences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "cad_tenant_idx" ON "cadences" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cad_enabled_idx" ON "cadences" USING btree ("tenant_id","enabled");--> statement-breakpoint
CREATE INDEX "lce_tenant_idx" ON "lead_cadence_enrollments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "lce_lead_idx" ON "lead_cadence_enrollments" USING btree ("lead_id","status");--> statement-breakpoint
CREATE INDEX "lce_fire_idx" ON "lead_cadence_enrollments" USING btree ("status","next_fire_at");--> statement-breakpoint
CREATE INDEX "lce_cadence_idx" ON "lead_cadence_enrollments" USING btree ("cadence_id");
