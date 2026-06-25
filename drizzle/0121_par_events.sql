-- VM1-04: par_events table + eventId FK on par_requests
-- Migration prefix: 0121 (> 0120 on origin/main)

CREATE TABLE "par_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "project_id" uuid,
  "name" varchar(200) NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "par_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade,
  CONSTRAINT "par_events_project_id_par_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."par_projects"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX "par_events_tenant_idx" ON "par_events" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "par_events_project_idx" ON "par_events" ("project_id");
--> statement-breakpoint
ALTER TABLE "par_requests" ADD COLUMN "event_id" uuid;
--> statement-breakpoint
ALTER TABLE "par_requests" ADD CONSTRAINT "par_requests_event_id_par_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."par_events"("id") ON DELETE set null;
