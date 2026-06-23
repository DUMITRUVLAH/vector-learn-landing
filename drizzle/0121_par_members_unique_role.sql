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
--> statement-breakpoint
-- Email is now normalized to lowercase at signup + looked up lowercased at login and in
-- PAR invite matching. Backfill any legacy mixed-case rows so those users can still log in
-- and so invite matching (invites are stored lowercase) is reliable. Guarded against the
-- per-(tenant,email) unique index: only lowercase a row when no lowercase twin already exists.
UPDATE "users" u
SET "email" = lower(u."email")
WHERE u."email" <> lower(u."email")
  AND NOT EXISTS (
    SELECT 1 FROM "users" v
    WHERE v."tenant_id" = u."tenant_id"
      AND v."email" = lower(u."email")
      AND v."id" <> u."id"
  );
