# CORE-004 Integration Architecture Review

**Date:** 2026-06-13
**Reviewer:** integration-architect

## Integration Check

### DB / Schema
- FinLayout fetches role from GET /api/fin/members/me — reads fin_members (CORE-001 migration 0116). CONNECTED.
- FinCompany fetches org profile from GET /api/fin/org — CORE-003 route. CONNECTED.

### Route Wiring
- src/App.tsx: routes /app/fin, /app/fin/company, /app/fin/* (fallback) added. CONNECTED.
- server/routes/finMembers.ts: new GET /me endpoint reads fin_members + fin_org_profile. CONNECTED.
- server/app.ts: finMembersRoutes mounted at /api/fin/members — /me sub-route auto-included. CONNECTED.

### Cross-module Data Flow
- FinLayout -> getFinMe() -> /api/fin/members/me -> fin_members JOIN users -> returns role + profile. Clean.
- FinCompany -> getFinOrgProfile() -> /api/fin/org -> fin_org_profile. Correct.

### Tenant Safety
- GET /me filters by AND(tenantId = user.tenantId, userId = user.id). PASS.

### Competing Systems
- ITPARK routes at /app/fin/itpark/* are matched first. No conflict with CORE-004 catch-all.

## Verdict: CONNECTED
