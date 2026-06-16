# PAR port: bring the newer PAR (procure-to-pay) from `par-app` into vector-learn-landing

**Why:** the PAR in `vector-learn-landing` (`/app/par/new`, old 7-step `ParCreateWizard`) is an
outdated version. The canonical, modified PAR lives in the standalone local repo
`/Users/dima/par-app` (no git remote) — a full procure-to-pay flow with quotes, purchase orders,
goods receipts, 3-way match, delegations, invites, templates, comments, audit.

**Decision (owner, 2026-06-16):** port the new PAR into vector-learn-landing under `/business/par/*`,
remove the old wizard. Schemas are FK-compatible (par-app was forked from this same codebase;
both use the same `tenants`/`users` tables).

## Scope (what differs)

### Schema — `server/db/schema/par.ts` (par-app has 21 tables, vl has 13)
NEW tables to add: `parTemplates, parInvites, parComments, parQuotes, parPurchaseOrders,
parReceipts, parReceiptLines, parDelegations`.
CHANGED: `parRequests` gains `exchangeRate` (numeric 14,6) + `totalMdlCents` (int) — VF-203 multicurrency.
→ Needs a NEW migration (prefix > max on origin/main) + schema-drift gate green + db:reset/seed.

### Server routes
NEW: `parAudit, parDelegations, parInvites, parPurchaseOrders, parReceipts, parTemplates`.
CHANGED (port newer version): `par (495), parApprovals (396), parPayments (79), parReports (70),
parSettings (4), parDoa (30), parVendors (16), parBudgetCodes (152)`.
SAME (skip): parMembers, parProjects, parDepartments, parTimeline, parAttachments, parMe.
→ Each new router MUST be mounted in server/app.ts (check-route-mounts gate).

### Frontend
NEW pages: `ParCreateForm.tsx` (replaces old ParCreateWizard), `ParOnboarding.tsx`.
NEW components: `ParComments, QuotesSection, ReceiptSection, ThreeWayMatchPanel`.
CHANGED: `src/lib/api/par.ts`, ParDashboard/ParDetail/ParInbox/ParFinanceQueue/ParReports/ParAdmin.
→ Wire under `/business/par/*` in App.tsx; remove old `ParCreateWizard` route. Keep BusinessGuardPage.

## Execution order (each step: build + check-refs + route-mounts green before next)
1. Schema: copy 8 new tables + 2 parRequests fields into par.ts; export in schema/index.ts.
2. Migration: hand-write .sql (drizzle generate is broken — see memory) for the 8 tables + 2 cols;
   append _journal.json; validate on throwaway PGlite; prefix > origin/main max.
3. Server routes: port changed + new routes; mount all in app.ts.
4. Frontend: port lib/api/par.ts, ParCreateForm + components + updated pages.
5. Wire App.tsx (/business/par/*), remove old wizard.
6. Gates + build + commit on branch `feat/par-port-procure-to-pay`.
7. Deploy, e2e the full PAR flow (create→approve→PO→receipt→3-way→pay) until green.

## Status: STARTED 2026-06-16. (Update this section as steps complete.)
