# BRANCH-703 Code Review — Cycle 1

**Date:** 2026-05-30
**Verdict:** APPROVED

## Design system / TypeScript
- `branchScope` is nullable UUID in schema — nullable FK semantics, correct.
- `getBranchScope()` is a single-responsibility helper, pure function testable in isolation.
- `userRoutes` uses zValidator (Zod schema validated on input), standard pattern.
- No `any` types; all routes use `AuthVariables` properly.

## Security
- PATCH /api/users/:id/branch-scope: admin-only gate (`role === "admin" || branchScope === null`).
  A scoped user cannot elevate themselves or set scopes for others.
- Target user tenant check: `and(eq(users.id, targetId), eq(users.tenantId, tenantId))` — cross-tenant access impossible.
- Scope enforcement: server-side `getBranchScope()` takes priority over any client-supplied `branch_id` parameter.

## Route files updated
- `students.ts` — `scope` trumps `branch_id` client param. Correct.
- `lessons.ts` — same pattern.
- `teachers.ts` — `and(tenantId, branchId = scope)` when scoped, `eq(tenantId)` otherwise.
- `invoices.ts` — filters via joined `students.branchId`. Correct join is already present.

## Migration
- `drizzle/0017_branch703_user_scope.sql` — single ALTER TABLE, no data loss.
- Journal updated, no collision with 0016.

## Issues found
- None blocking.

**Verdict: APPROVED**
