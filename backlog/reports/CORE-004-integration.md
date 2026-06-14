# CORE-004 Integration Architecture Review

**Date:** 2026-06-13
**Reviewer:** integration-architect

## Integration Check

### DB / Schema
- FinLayout fetches role from `GET /api/fin/members/me` — added in this item, reads `fin_members` (CORE-001 migration). CONNECTED.
- FinCompany fetches org profile from `GET /api/fin/org` — CORE-003 route. CONNECTED.

### Route Wiring
- `src/App.tsx`: routes `/app/fin`, `/app/fin/company`, `/app/fin/*` (fallback) added. All three import statements resolve. CONNECTED.
- `server/routes/finMembers.ts`: new `GET /me` endpoint reads `fin_members` + `fin_org_profile` — both exported from `finCore.ts` schema, imported correctly. CONNECTED.
- `server/app.ts`: already mounts `finMembersRoutes` at `/api/fin/members` — the new `/me` sub-route is picked up automatically. CONNECTED.

### Cross-module Data Flow
- FinLayout → getFinMe() → `/api/fin/members/me` → fin_members JOIN users → returns role + profile. Clean data path.
- FinCompany → getFinOrgProfile() → `/api/fin/org` → fin_org_profile. Correct.
- No mutation: CORE-004 is UI-only + one new read endpoint. Zero risk of data side effects.

### Tenant Safety
- `GET /me` filters by `AND(tenantId = user.tenantId, userId = user.id)` — correct. PASS.
- No cross-tenant leak possible.

### Competing Systems
- No duplication: ITPARK routes at `/app/fin/itpark/*` are more specific and matched first in App.tsx. The new catch-all `/app/fin/*` is correctly placed after. No conflict.

## Verdict: CONNECTED
