-- PAR access model: stop treating the tenant role "manager" as an implicit par_admin.
--
-- Until now `requirePARRole` waved through any tenant admin OR manager for EVERY
-- PAR role. A manager could approve payment requests, read the audit log and hand
-- out PAR roles while never appearing in par_members — so the members screen gave
-- the wrong answer to "who can approve payments here?". That defeats the point of
-- a segregation-of-duties system.
--
-- The bootstrap problem the rule solved (a brand-new tenant has zero par_members,
-- so nobody could assign the first one) is fully covered by "admin" alone.
--
-- Narrowing the rule in code alone would instantly revoke access from managers who
-- rely on it today. So first MATERIALIZE what they already have: give every
-- manager an explicit par_admin row — but only in tenants that actually use PAR,
-- so we don't hand PAR roles to orgs that never opened the module. After this,
-- their authority is visible in the members list and revocable from there.

INSERT INTO par_members (tenant_id, user_id, role)
SELECT u.tenant_id, u.id, 'par_admin'
FROM users u
WHERE u.role = 'manager'
  -- only tenants where PAR is in use
  AND (
    EXISTS (SELECT 1 FROM par_members pm WHERE pm.tenant_id = u.tenant_id)
    OR EXISTS (SELECT 1 FROM par_requests pr WHERE pr.tenant_id = u.tenant_id)
  )
  -- don't duplicate an existing grant
  AND NOT EXISTS (
    SELECT 1 FROM par_members pm2
    WHERE pm2.tenant_id = u.tenant_id AND pm2.user_id = u.id AND pm2.role = 'par_admin'
  );
