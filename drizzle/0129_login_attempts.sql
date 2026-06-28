-- ============================================================================
-- 0129_login_attempts.sql
-- SEC-02: durable, serverless-safe login rate-limiting store.
-- One row per "<email>|<ip>" bucket. IF NOT EXISTS so it's a no-op if already present.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "attempt_key" varchar(320) NOT NULL,
  "count" integer NOT NULL DEFAULT 0,
  "window_start" timestamp with time zone NOT NULL DEFAULT now(),
  "locked_until" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "login_attempts_attempt_key_unique" UNIQUE ("attempt_key")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "login_attempts_key_idx" ON "login_attempts" ("attempt_key");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "login_attempts_locked_idx" ON "login_attempts" ("locked_until");
