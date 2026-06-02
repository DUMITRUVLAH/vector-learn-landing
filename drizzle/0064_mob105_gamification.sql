-- MOB-105: Gamification — XP events, student streaks, badges
-- Also adds leaderboard_opt_in column to students

CREATE TABLE IF NOT EXISTS "xp_events" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   UUID NOT NULL,
  "student_id"  UUID NOT NULL,
  "type"        VARCHAR(50) NOT NULL,
  "amount"      INT NOT NULL DEFAULT 10,
  "description" TEXT,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_streaks" (
  "id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"           UUID NOT NULL,
  "student_id"          UUID NOT NULL,
  "current_streak"      INT NOT NULL DEFAULT 0,
  "longest_streak"      INT NOT NULL DEFAULT 0,
  "last_activity_date"  DATE,
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "student_streaks_student_uniq" UNIQUE ("tenant_id", "student_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "badges" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   UUID NOT NULL,
  "student_id"  UUID NOT NULL,
  "badge_type"  VARCHAR(50) NOT NULL,
  "earned_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Add leaderboard opt-in flag to students
ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "leaderboard_opt_in" BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
-- Indexes
CREATE INDEX IF NOT EXISTS "idx_xp_events_student"
  ON "xp_events" ("tenant_id", "student_id", "occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_badges_student"
  ON "badges" ("tenant_id", "student_id");
