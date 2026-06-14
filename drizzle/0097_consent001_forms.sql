-- CONSENT-001: Formulare de consimțământ cu e-semnătură
-- Migration prefix: 0036 (follows 0035_school007_news)
-- No CREATE TYPE enum needed (status is varchar for flexibility)

-- Tabelul șabloanelor de formulare
CREATE TABLE IF NOT EXISTS "consent_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "category" varchar(50),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "consent_templates_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_templates_tenant_active_idx" ON "consent_templates" ("tenant_id", "is_active");
--> statement-breakpoint

-- Tabelul cererilor de consimțământ (per tutore per elev per formular)
CREATE TABLE IF NOT EXISTS "consent_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "student_id" uuid NOT NULL,
  "guardian_id" uuid NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "signed_at" timestamp with time zone,
  "signed_by_name" varchar(200),
  "declined_at" timestamp with time zone,
  "decline_reason" varchar(500),
  "sent_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "consent_requests_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "consent_requests_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "consent_templates"("id") ON DELETE CASCADE,
  CONSTRAINT "consent_requests_student_id_fk" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE,
  CONSTRAINT "consent_requests_guardian_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "student_guardians"("id") ON DELETE CASCADE,
  CONSTRAINT "consent_requests_template_student_guardian_uniq" UNIQUE ("template_id", "student_id", "guardian_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_requests_tenant_status_idx" ON "consent_requests" ("tenant_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_requests_tenant_student_idx" ON "consent_requests" ("tenant_id", "student_id");
