-- PAR invite↔approver hardening: make par_members idempotent at the DB level.
-- grantInviteRole (server/lib/par/acceptInvite.ts) does a find-then-insert "create role
-- if absent"; two concurrent grants (e.g. a login auto-link racing an accept) could both
-- read "absent" and both insert, producing duplicate (tenant_id,user_id,role) rows that
-- make getUserPARRoles return the role twice. A UNIQUE index makes the insert atomically
-- idempotent (paired with onConflictDoNothing in code) and also hardens the existing
-- par_members add-member route.
--
-- First collapse any pre-existing duplicates (keep the earliest row per group) so the
-- UNIQUE index can be created on prod data; then add the index.
DELETE FROM "par_members" a
USING "par_members" b
WHERE a."tenant_id" = b."tenant_id"
  AND a."user_id" = b."user_id"
  AND a."role" = b."role"
  AND a."ctid" > b."ctid";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "par_members_tenant_user_role_uniq"
  ON "par_members" ("tenant_id", "user_id", "role");
