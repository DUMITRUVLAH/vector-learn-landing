---
item: CORE-005
verdict: CONNECTED
date: 2026-06-13
---

## integration-architect — CORE-005 FinDesk Onboarding Wizard

### Verdict: CONNECTED

### Route wiring
- GET/PATCH /api/fin/onboarding mounted in server/app.ts line 350: `app.route("/api/fin/onboarding", finOnboardingRoutes)`
- check-route-mounts.mjs: PASS
- UI route /app/fin/onboarding added to src/App.tsx

### Schema connection
- Uses `fin_onboarding` table from finCore.ts (CORE-001) — already in schema
- `drizzle/0116_fin_core.sql` includes CREATE TABLE fin_onboarding — migration exists
- finOnboarding exported from server/db/schema/index.ts via `export * from "./finCore"`

### Tenant isolation
- GET: WHERE tenantId = user.tenantId (via getOrCreate helper)
- PATCH: WHERE tenantId = user.tenantId in UPDATE
- No cross-tenant data leakage

### Cross-module data flow
- Wizard links to /app/fin/company (CORE-003) for step 1 — correct
- Steps 2 and 3 (PARTY, BILL) not yet built — graceful fallback ("În curând") — correct
- FinLayout wraps the wizard — role gating in place (viewer+ can access)
- requireFinRole("viewer") on both GET and PATCH — any fin member can advance onboarding

### No competing systems
- Does not duplicate any existing onboarding or wizard functionality in the main app
- fin_onboarding is FinDesk-only, separate from the main CRM

### Connected checks
- [x] Route mounted
- [x] Schema exported
- [x] Tenant isolated
- [x] Graceful degradation for not-yet-built modules
- [x] Integration smoke: GET /api/fin/onboarding returns onboarding record; PATCH advances step
