-- GAP-017: Portal notification preferences per student
-- Controls which proactive notifications are sent

CREATE TABLE IF NOT EXISTS "portal_notification_prefs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "lesson_reminder" boolean NOT NULL DEFAULT true,
  "reminder_hours_before" integer NOT NULL DEFAULT 24,
  "debt_alert" boolean NOT NULL DEFAULT true,
  "debt_threshold_cents" integer NOT NULL DEFAULT 20000,
  "package_low_alert" boolean NOT NULL DEFAULT true,
  "package_low_threshold" integer NOT NULL DEFAULT 2,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "pnp_tenant_idx" ON "portal_notification_prefs" ("tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "pnp_student_uniq" ON "portal_notification_prefs" ("student_id");
