CREATE TABLE IF NOT EXISTS "parent_student_links" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"      UUID NOT NULL,
  "parent_user_id" UUID NOT NULL,
  "student_id"     UUID NOT NULL,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "direct_messages" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"    UUID NOT NULL,
  "from_user_id" UUID NOT NULL,
  "to_user_id"   UUID NOT NULL,
  "body"         TEXT NOT NULL,
  "sent_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "read_at"      TIMESTAMPTZ,
  "queued"       BOOLEAN NOT NULL DEFAULT false
);
--> statement-breakpoint
-- Index for fast per-tenant parent lookups
CREATE INDEX IF NOT EXISTS "idx_parent_student_links_tenant_parent"
  ON "parent_student_links" ("tenant_id", "parent_user_id");
--> statement-breakpoint
-- Index for conversation thread queries
CREATE INDEX IF NOT EXISTS "idx_direct_messages_thread"
  ON "direct_messages" ("tenant_id", "from_user_id", "to_user_id", "sent_at" ASC);
