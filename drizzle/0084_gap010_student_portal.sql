CREATE TABLE IF NOT EXISTS "student_portal_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "token" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "last_used_at" timestamp with time zone,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spt_tenant_idx" ON "student_portal_tokens" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spt_token_idx" ON "student_portal_tokens" ("token");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spt_student_idx" ON "student_portal_tokens" ("student_id", "is_active");
