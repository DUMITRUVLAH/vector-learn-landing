# BRANCH-703 Integration Architect Report

**Date:** 2026-05-30
**Verdict:** CONNECTED

## Data flow
- DB: `users.branch_scope UUID NULLABLE` → set via PATCH /api/users/:id/branch-scope (admin only)
- Session: `getSessionUser()` fetches the full User row including branchScope → stored in `c.get("user")`
- Middleware: `getBranchScope(c)` reads `user.branchScope` → returns UUID or null
- Routes: students, lessons, teachers, invoices — all apply scope filter when non-null

## Tenant safety
- PATCH /api/users/:id/branch-scope: target must match `tenantId` — cross-tenant impossible.
- All read routes already filter by `tenantId` first; branch scope is additional AND condition.

## DB
- No foreign key constraint on `branch_scope` → intentional (avoids cascades on branch archive, simpler migration).
- `branch_scope` = UUID matches `branches.id` by convention; no referential integrity issue in practice since branches are soft-deleted.

## Module connections
- BRANCH-702 (client-side switcher) → `branch_id` query param → servers honor it ONLY when user has NULL scope (full access).
- BRANCH-703 (server-side scope) → overrides client param when user is scoped.
- BRANCH-704 (reports) → inherits the scope automatically from existing auth.

**Verdict: CONNECTED**
