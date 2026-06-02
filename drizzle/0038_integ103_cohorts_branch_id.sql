-- INTEG-103: Add branch_id to cohorts table
-- Nullable UUID (soft-ref). FK constraint to branches(id) deferred until BRANCH-faza-1 PR merges.
-- Enables filtering cohorts per branch and per-branch cohort analytics.

ALTER TABLE "cohorts" ADD COLUMN IF NOT EXISTS "branch_id" uuid;
