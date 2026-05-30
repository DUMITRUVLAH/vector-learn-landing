# BRANCH-702 Integration Architect Report

**Date:** 2026-05-30
**Verdict:** CONNECTED

## Cross-module data flow
- BranchContext (React) → BranchSwitcher (header UI) → sets activeBranch in localStorage
- StudentsPage.fetchList → listStudents({ branch_id }) → GET /api/students?branch_id → server filter: `eq(students.branchId, branch_id)`
- students.branchId field: UUID FK → branches.id (set by BRANCH-701 schema)
- Lessons route: `eq(lessons.branchId, branch_id)` — same pattern, lessons.branchId from BRANCH-701

## Tenant safety
- All routes already filter by `tenantId` first; branch_id is an additional AND condition.
- A user cannot access another tenant's branches (listBranches scoped to `tenantId`).

## DB foreign keys
- students.branchId → nullable UUID, no migration needed (already exists from BRANCH-701).
- lessons.branchId → nullable UUID, same.

## API contracts
- GET /api/students: query param `branch_id` (UUID, optional) → returns filtered items.
- GET /api/lessons: query param `branch_id` (UUID, optional) → returns filtered items.
- Both return the same shapes as without the param.

## Missing wiring (out of scope for this item)
- Teachers, payments, invoices pages do not yet consume BranchContext — spec says only students + lessons for BRANCH-702.
- BRANCH-703 will add server-side enforcement; BRANCH-702 is UI-only client filter.

**Verdict: CONNECTED**
