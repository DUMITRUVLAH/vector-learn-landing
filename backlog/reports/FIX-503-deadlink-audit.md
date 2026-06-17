# FIX-503 Dead-link Audit Report — 2026-06-17

## Summary

Full audit of all sidebar/nav hrefs vs App.tsx routes. Found 3 component-level dead-link classes.
FIX-501 and FIX-502 addressed the critical FinNav/payroll issues. This audit found 3 additional dead links
fixed as part of FIX-503, plus documented the structural CRM split issue (SPLIT-401 scope).

---

## FinNav (`src/components/fin/FinNav.tsx`)

**Status: FIXED by FIX-501**

All 17 hrefs pointed to `/app/fin/*` — no App.tsx routes exist for those paths. Catch-all
`RedirectToBusiness` ejected the user on every sidebar click.

| href (was) | href (fixed) | Route in App.tsx |
|------------|--------------|-----------------|
| `/app/fin` | `/business/fin/` | `startsWith("/business/fin/")` |
| `/app/fin/company` | `/business/fin/onboarding` | `startsWith("/business/fin/onboarding")` |
| `/app/fin/members` | `/business/fin/onboarding` | `startsWith("/business/fin/onboarding")` |
| `/app/fin/parties` | `/business/fin/parties` | `startsWith("/business/fin/parties")` |
| `/app/fin/agreements` | `/business/fin/agreements` | `startsWith("/business/fin/agreements")` |
| `/app/fin/invoices` | `/business/fin/invoices` | `startsWith("/business/fin/invoices")` |
| `/app/fin/einvoice` | `/business/fin/einvoices` | `startsWith("/business/fin/einvoices")` |
| `/app/fin/cash` | `/business/fin/cash` | `startsWith("/business/fin/cash")` |
| `/app/fin/expenses` | `/business/fin/expenses` | `startsWith("/business/fin/expenses")` |
| `/app/fin/capture` | `/business/fin/captures` | `startsWith("/business/fin/captures")` |
| `/app/fin/payroll` | `/business/fin/payroll` | `startsWith("/business/fin/payroll")` |
| `/app/fin/assets` | `/business/fin/assets` | `startsWith("/business/fin/assets")` |
| `/app/fin/tax` | `/business/fin/tax` | `startsWith("/business/fin/tax")` |
| `/app/fin/insight` | `/business/fin/ledger` | `startsWith("/business/fin/ledger")` |
| `/app/fin/calendar` | `/business/fin/calendar` | `startsWith("/business/fin/calendar")` |
| `/app/fin/bulk` | `/business/fin/mass` | `startsWith("/business/fin/mass")` |
| `/app/fin/security` | `/business/fin/settings/security` | `startsWith("/business/fin/settings/security")` |

---

## FinHome (`src/pages/fin/FinHome.tsx`)

**Status: FIXED by FIX-502 (same dead-link class as FinNav)**

Module cards in the FinDesk home page had the same `/app/fin/*` hrefs. Fixed with same mapping.

---

## Payroll — wrong page mounted (`src/App.tsx`)

**Status: FIXED by FIX-502**

`/business/fin/payroll` mounted CRM `PayrollPage` (calls `/api/hr/payroll` — unmounted) instead of
FinDesk `PayrollFINPage` (calls `/api/fin/payroll/runs` — mounted). Also added
`/business/fin/payroll/runs/:id` route and fixed internal links in all `pages/fin/Payroll*.tsx`.

---

## AppShell BUSINESS_NAV_GROUPS (`src/components/app/AppShell.tsx`)

**Status: FIXED by FIX-503**

| href (was) | href (fixed) | Reason |
|------------|--------------|--------|
| `/business/fin/insights` | `/business/fin/ledger` | FinInsightsPage is mounted at `/business/fin/ledger`, not `/business/fin/insights` |

---

## BusinessShell (`src/components/business/BusinessShell.tsx`)

**Status: FIXED by FIX-503**

| href (was) | href (fixed) | Reason |
|------------|--------------|--------|
| `/business/itpark` | `/business/fin/itpark` | ItparkDetail is mounted at `/business/fin/itpark` |
| `/business/itpark/dashboard` | `/business/fin/itpark` | No dedicated dashboard route; redirected to ITPark main |

---

## AppShell CRM NAV_GROUPS (`src/components/app/AppShell.tsx`)

**Status: DOCUMENTED — structural issue → SPLIT-401**

The CRM sidebar (`/app/students`, `/app/leads`, `/app/payments`, `/app/hr/payroll`, etc.) links are
NOT in App.tsx routes. This is a known structural issue from the CRM↔Business Suite split.
These routes existed in an earlier version of App.tsx before the Business Suite was extracted.
**These are tracked as SPLIT-401** (business shell unification) and are NOT fixed here to avoid
unintended scope creep. The `check-nav-links.mjs` guard intentionally excludes the CRM NAV_GROUPS.

---

## API Client → Server Audit

| API file | endpoints called | Server mount | Status |
|----------|-----------------|--------------|--------|
| `src/lib/api/payroll.ts` | `/api/hr/payroll*` | NOT MOUNTED in server/app.ts | FIXED: App.tsx no longer mounts CRM PayrollPage |
| `src/pages/fin/PayrollPage.tsx` | `/api/fin/payroll/runs` | `finPayrollRoutes` at `/api/fin/payroll` | OK |
| `src/pages/fin/PayrollRunDetailPage.tsx` | `/api/fin/payroll/runs/:id/items`, `/mark-paid` | `finPayrollRoutes` | OK |
| `src/pages/fin/PayrollEmployeesPage.tsx` | `/api/fin/payroll/employees` | `finPayrollRoutes` | OK |
| All other `src/lib/api/*.ts` | (not audited individually) | check-route-mounts.mjs covers this | Covered by existing guard |

---

## Guard added

`scripts/check-nav-links.mjs` — wired into:
- `vercel.json` buildCommand (runs before vite build)
- `.github/workflows/prod-safety.yml` (CI gate on every PR + push to main)

Covers: FinNav, BusinessShell, AppShell(BUSINESS_NAV_GROUPS). Exits 1 on any dead href.
