---
item: REGISTRY-001
verdict: CONNECTED
date: 2026-06-14
---

## integration-architect — REGISTRY-001 FinDesk Tax Rates + Chart of Accounts

### Verdict: CONNECTED

### Connection map

- **fin_tax_rates** → will be consumed by FISC (VAT computation), PAY (payroll), SPEND (deductible VAT) via rateAt()
- **fin_chart_of_accounts** → will be consumed by BILL (account mapping), SPEND (expense categorization)
- **No routes in this item** — data layer only. No check-route-mounts issue for REGISTRY-001 itself.

### Migration discipline
- Migration 0117_fin_registry.sql: hand-written, idempotent (DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL $$)
- statement-breakpoint between each statement — breakpoints rule compliant
- Added to _journal.json as idx:117, no collision with main (max=114), no collision with feat/FIN-core (116) since PRs are separate
- 0117_snapshot.json created (minimal but valid for drizzle's inspection)

### Schema index rule
- finRegistry.ts exported from server/db/schema/index.ts — COMPLIANT

### Tenant isolation
- tenantId nullable: global seed (NULL) + tenant override — correct pattern
- When tenant queries (future routes): always filter by tenantId

### Pre-existing gate fix
- ITPARK-701 (itparkAiRoutes) and ITPARK-702 (itparkDashboardRoutes) were in main's codebase but unmounted
- Mounted in this commit to keep check-route-mounts green
- These routes belong to the ITPARK module but were orphaned on main

### No competing systems
- This is the FIRST fin registry implementation — no duplication
