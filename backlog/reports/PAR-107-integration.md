# PAR-107 Integration Report

**Verdict:** CONNECTED

## Module connections verified

- `resolveApprovalChain` (PAR-002/doa.ts) called correctly at submit time
- `par_approvals` rows created with proper FK to `par_requests` + `tenants`
- `body_hash` stored on `par_requests` (migration 0114)
- `locked` column on `par_approvals` (migration 0114)
- `parApprovalsRoutes` mounted in `server/app.ts` before generic `/:id` handler
- `/app/par/inbox` route added to `src/App.tsx` (before `/app/par` generic)
- `par_audit` written on submit
- Tenant isolation on every query: `eq(parRequests.tenantId, tenantId)`
- Money in integer minor units throughout

## No competing systems
- Reuses existing `requireAuth` + `getUserPARRoles` middleware
- No new auth system introduced

## Data flow
`Draft PAR → submit → resolveApprovalChain → par_approvals(step0+chain) → status=pending_approval + body_hash stored`
`Approver → POST /api/par/:id/approve → step decision → unlock next OR PAR→approved/in_finance`
