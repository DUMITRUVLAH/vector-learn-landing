-- PARQA-007: carry the DOA-matrix required par_role onto each approval step, so a role-specific
-- step (e.g. "step 2 must be signed by finance") is actually restricted to that role at approve time.
-- Null = any approver (role-based step, unchanged behavior).
ALTER TABLE "par_approvals" ADD COLUMN IF NOT EXISTS "approver_par_role" varchar(50);
