-- PERF audit: composite/partial indexes for hot PAR query paths that today only have
-- single-column indexes and fall back to a tenant-wide scan + in-memory sort/filter.
-- All IF NOT EXISTS — prod's migration tracking is desynced (see sync-schema.ts), so this
-- must be idempotent no matter which state prod is actually in.

-- requireModuleEntitlement (server/middleware/requireModuleEntitlement.ts) runs on every
-- /api/par/* request and filters par_payer_modules by tenant_id + module_key; the existing
-- index is (payer_id, module_key) and doesn't serve the tenant-wide lookup.
CREATE INDEX IF NOT EXISTS "par_payer_modules_tenant_module_idx" ON "par_payer_modules" ("tenant_id","module_key");
--> statement-breakpoint

-- Main PAR list (GET /api/par, server/routes/par.ts): filters tenant_id, orders by created_at.
CREATE INDEX IF NOT EXISTS "par_requests_tenant_created_idx" ON "par_requests" ("tenant_id","created_at" DESC);
--> statement-breakpoint

-- Approvals inbox (server/routes/parApprovals.ts): filters tenant_id + status, orders by submitted_at.
CREATE INDEX IF NOT EXISTS "par_requests_tenant_status_submitted_idx" ON "par_requests" ("tenant_id","status","submitted_at" DESC);
--> statement-breakpoint

-- Reports/export date-range filter (server/routes/parReports.ts): tenant_id + date_of_request range.
CREATE INDEX IF NOT EXISTS "par_requests_tenant_date_of_request_idx" ON "par_requests" ("tenant_id","date_of_request");
--> statement-breakpoint

-- Finance payment queue (server/routes/parPayments.ts): tenant_id + purpose + status.
CREATE INDEX IF NOT EXISTS "par_requests_tenant_purpose_status_idx" ON "par_requests" ("tenant_id","purpose","status");
--> statement-breakpoint

-- Single-column indexes for FK/filter columns used in WHERE/JOIN/GROUP BY but never indexed
-- (par.ts project filter, VM1-04 event filter, parReports/parBudgetCodes/parReports department+budget).
CREATE INDEX IF NOT EXISTS "par_requests_project_idx" ON "par_requests" ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_requests_event_idx" ON "par_requests" ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_requests_budget_code_idx" ON "par_requests" ("budget_code_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "par_requests_department_idx" ON "par_requests" ("department_id");
--> statement-breakpoint

-- Approvals inbox reads every pending+unlocked step of the tenant (parApprovals.ts); partial
-- index keeps this small and self-pruning as steps get decided.
CREATE INDEX IF NOT EXISTS "par_approvals_tenant_pending_unlocked_idx" ON "par_approvals" ("tenant_id") WHERE "decision" = 'pending' AND "locked" = false;
