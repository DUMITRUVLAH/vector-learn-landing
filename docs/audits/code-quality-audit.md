# Vector Learn — Code-Quality Audit

_Date: 2026-06-02 · Scope: `src/` (frontend, React 18 + TS strict + Vite) and `server/` (Hono API) · Read-only audit (lint executed, no code modified)._

## Executive summary

The codebase is **substantially healthier than its "uneven autopilot output" reputation suggests**. Type safety is excellent (single-digit `any` usage across 139k LOC), validation is consistently enforced with zod, error handling has a global handler plus explicit status codes, and test coverage is broad (200 test files, ~3,400 assertions). The real debt is concentrated and cheap to fix: **lint hygiene (202 problems, mostly unused imports)**, **money-formatting duplication (16 inline copies of a util that already exists)**, and **a missing React ErrorBoundary** (one runtime crash white-screens the whole SPA).

| Metric | Count | Verdict |
|---|---|---|
| Total LOC (src + server) | 139,038 | — |
| `: any` / `as any` / `any[]`/generics | 13 total | Excellent |
| `@ts-ignore` / `@ts-expect-error` | 3 (all in tests) | Excellent |
| Hardcoded hex in `.tsx` (non-test) | ~21 (mostly legit) | Good |
| `console.log` in non-test code | 24 (all in scripts/cron) | Good |
| Commented-out code blocks | 0 | Excellent |
| Real TODO/FIXME | 2 | Excellent |
| Lint problems | 202 (18 errors, 184 warnings) | Needs cleanup |
| Frontend ErrorBoundary | 0 | **Gap** |
| Inline money formatters | 16 files | **Duplication** |
| Test files (src / server) | 195 / 5 | Broad front, thin server |
| Total assertions | ~3,436 | Healthy density |

---

## P1 — Fix now (correctness / user-facing risk)

### 1.1 No React ErrorBoundary anywhere in the app
`grep` for `ErrorBoundary` / `componentDidCatch` / `getDerivedStateFromError` across `src/**` returns **zero matches**. For a single-page CRM, any uncaught render error (a `.map` on undefined, a null field from a 500'd fetch) unmounts the entire React tree → **white screen** for the paying client. This is the exact failure class CLAUDE.md §3.5.1ter warns about, but there is no client-side last line of defence.

**Fix:** add one `ErrorBoundary` component wrapping the router (`src/router/HashRouter.tsx` or `App.tsx`) that renders a friendly fallback + "reload" and reports the error. ~30 LOC. Optionally a per-route boundary so one broken page doesn't kill navigation.

### 1.2 Lint errors (18) should be zero on `main`
`npm run lint` → **18 errors**:
- **15× `@typescript-eslint/no-require-imports`** in `server/routes/enroll.ts`, `src/lib/api/branches.ts`, and four `src/__tests__/{gap,pay}/*.test.ts`. Convert `require(...)` to `import`/`await import(...)`.
- **1× `prefer-const`** — a `let status` never reassigned.
- **1× `@typescript-eslint/no-empty-object-type`** in `src/lib/api/branches.ts` — an empty interface; replace with the supertype or a type alias.
- **1× `no-irregular-whitespace`** — a stray non-breaking space; delete it.

All 18 are mechanical. CLAUDE.md §9 requires lint green before ship; these are blocking that bar.

---

## P2 — Fix soon (maintainability)

### 2.1 Money formatting duplicated across 16 files
`src/lib/utils.ts` already exports `formatCents(cents, currency = "RON")` using `Intl.NumberFormat`. Yet 16 files re-declare their own `formatCurrency` / `formatEuro` inline, e.g.:
- `src/pages/app/InvoicesPage.tsx:52` — `function formatCurrency(cents, currency: InvoiceCurrency = "RON")`
- `src/pages/app/AccountingPage.tsx:24` — `function formatCurrency(cents)`
- `src/components/payments/RefundModal.tsx:21` — `function formatCurrency(cents, currency = "RON")`
- plus `SubscriptionTable`, `CohortStats`, `BranchKpiCards`, `StudentPortalPage`, `ParentPortalPage`, `CoursesPage`, `SchoolTuitionPage`, `BranchReportsPage`, `PaymentPlansPage`, `ContractsPage`, `ParentDashboardPage`, and `LeadsPage:331`.

These copies drift: some hardcode RON, some accept currency, locale handling varies. **Fix:** delete the inline copies, import `formatCents` from `src/lib/utils.ts` (extend it with an optional locale arg if a page needs one). Eliminates ~16 divergent rounding/locale behaviors for amounts shown to paying parents — the highest-stakes display in the product.

### 2.2 184 lint warnings — 131 are dead imports
Breakdown of the 184 warnings:
- **131× `@typescript-eslint/no-unused-vars`** — unused imports/vars (`MoreVertical`, `Check`, `AlertTriangle`, `Medal`, `CreditCard`, `XCircle`, `SOURCE_LABEL`, `xpToNextLevel`, `VECTOR_LEARN_MONTHLY_BASE`, …). Dead leftovers from autopilot iterations.
- **30× `react-refresh/only-export-components`** — files exporting both a component and constants/helpers (e.g. `HashRouter.tsx`, `IntegrariPage.tsx`, `ROICalculatorPage.tsx`). Move shared constants to a sibling module.
- **23× `no-console`** — see 2.3.

**Fix:** `npm run lint -- --fix` clears the trivially-fixable subset; the unused-import sweep is safe and removes ~70% of the noise in one pass.

### 2.3 `console.log` flagged by lint (23) — confirm scoping
All 24 non-test `console.log` calls live in operational scripts, not request handlers: `server/db/seed.ts` (16), `server/index.ts` / `server/dev-entry-contacts.ts` (boot banners), `server/db/migrate.ts`, `server/db/sync-schema.ts`, `server/lib/reminderCron.ts`. This is acceptable operational logging, **but lint still errors on them**. Either scope the `no-console` rule to allow these script paths in `eslint.config`, or switch them to a tiny logger. No `console.log` exists inside any HTTP route handler — good.

---

## P3 — Minor / accept-with-note

### 3.1 Hardcoded hex in `.tsx` — mostly legitimate
~21 non-test occurrences; nearly all are justified and **not** design-system violations:
- **Canvas rendering** (`CertificateCanvas.tsx`, `KinderCheckinPage.tsx`, `KinderIncidentsPage.tsx`) — `ctx.fillStyle`/`strokeStyle` can't use Tailwind tokens.
- **Color-picker defaults / placeholders** (`BrandingPage.tsx`, `FieldControls.tsx`) — these ARE the user-chosen colors; `#2563eb`/`#7c3aed` are documented defaults.
- **Brand-accurate chat mockups** (`MessagePreview.tsx`) — WhatsApp `#005c4b`/`#0b141a`, Telegram `#2b5278`/`#17212b`; intentionally off-token to look real.
- **macOS traffic-light dots** (`Hero.tsx`) — `#FF5F57`/`#FEBC2E`/`#28C840` are the literal OS colors.

**Action:** none required, but add a short `// eslint-disable`/comment noting "literal brand/canvas color, not a token" so future audits don't re-flag. Verify the canvas pages still render correctly in dark mode (canvas colors are fixed and may look wrong on dark — worth a visual check on `CertificateCanvas` / Kinder pages).

### 3.2 `any` usage — all 13 are defensible, none in app logic
- `server/lib/companyRegistry.ts` (4) and `server/lib/push.ts` (1) — parsing untyped external API / optional `web-push` dependency. Reasonable, could be tightened with zod or a `.d.ts` shim.
- `server/app.ts:207` — `(tablesResult as any).rows` is the documented PGlite-vs-Postgres shape guard (CLAUDE.md §3.5.1); correct.
- `server/routes/certificateTemplates.ts` (2) `body.fieldsConfig as any` — JSON column; narrow with a zod schema.
- `src/components/app/ImportStudentsModal.tsx:80` `(row as any)[field]` — dynamic CSV row build; acceptable.
- Two flagged lines (`paymentAccounts.ts:134`, `CompanySearchInput.tsx:23`) are false positives (typed `RegistryCompany[]`).

The 3 `@ts-expect-error` are all in test mocks with explanatory comments. Excellent discipline for an autopilot-built codebase.

### 3.3 Server test coverage is thin relative to surface area
- **96 route files** but only **5 server-side test files** (`companyRegistry`, `certificates-{issue,public,bulk}`, `paymentAccountTotals`). Most route behavior is exercised indirectly via the 195 `src/__tests__` files (which run against PGlite). CLAUDE.md §3.5.1 itself warns PGlite-only tests pass while the integrated app is broken.
- **80 of 195 front-end tests** match render-only smoke heuristics (`renders without`, `toBeInTheDocument`). Many are legitimately interaction-tested (3,436 total assertions = healthy density), but the smoke-heavy long tail offers weak regression protection.

**Fix:** add server-route integration tests for the highest-risk handlers — auth, payments, invoices, leads→student conversion — hitting the live Hono app (per §3.5.1 "live API integration smoke"), not just component renders.

---

## What's genuinely good (don't regress)

- **Validation:** `zValidator`/zod present in 84 route files (289 usages) — input validation is the rule, not the exception.
- **Error handling:** global `app.onError` handler in `server/app.ts:71` (logs + 500 JSON), and 435 explicit `c.json(..., 4xx/5xx)` status returns across routes. No bare unhandled throws (only 2 `throw` in all of `server/routes`).
- **Fetch layer:** a shared `api` wrapper (`src/lib/api/api.ts`) is imported by the per-domain clients in `src/lib/api/*.ts`; raw `fetch(` is rare and confined to public/portal/streaming endpoints.
- **Type safety:** 13 `any` in 139k LOC, zero `@ts-ignore` outside tests.
- **No commented-out code, 2 real TODOs.**

---

## Recommended order of work

1. Add `ErrorBoundary` around the router (P1.1) — biggest user-facing risk.
2. `npm run lint -- --fix` then manually clear the 18 errors → lint green (P1.2, P2.2).
3. Consolidate money formatting onto `formatCents` (P2.1).
4. Scope/remove `no-console` in scripts (P2.3).
5. Add server-route integration tests for auth/payments/invoices/leads (P3.3).
6. Annotate the legit canvas/brand hex colors and dark-mode-check the canvas pages (P3.1).
