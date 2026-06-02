# Vector Learn — Architecture Review (Macro)

> Read-only review. No code was modified.
> Date: 2026-06-02 · Scope: server/ (Hono API, Drizzle, Vercel deploy) + src/ (React/Vite frontend).
> Method: macro structural analysis (route/schema/entry-point wiring, layering, cross-cutting
> concerns, duplication), NOT line-by-line code review.

---

## TL;DR — Top architectural risks

| # | Risk | Severity |
|---|------|----------|
| 1 | **~41 of 95 route files are never mounted in `server/app.ts`** — entire feature modules (School/K-12, attendance, timetable, homework, grades, tuition, accounting, messages, mobile, stripe, users, settings, branches, groups, guardians…) are dead on the deployed server. The frontend *calls* several of them (`/api/school/*`, `/api/messages`, `/api/attendance`, `/api/accounting`) → those calls fall through to the SPA HTML fallback and break in prod. | **Critical** |
| 2 | **Three competing API entry points that have drifted.** `server/index.ts` is a stale duplicate of `app.ts` that mounts only 8 routes and still contains the `.rows` portability bug CLAUDE.md says was fixed. `dev-entry-contacts.ts` exists *because the autopilot couldn't edit the "contested" `app.ts`* (its own comment). | **Critical** |
| 3 | **No service layer.** Routes talk directly to Drizzle. The two things in `server/services/` (messaging, notifications) are the exception; ~89 routes inline business logic + DB access + validation. Reuse happens by copy-paste. | **High** |
| 4 | **103 raw `.execute().rows` usages across routes** — the exact PGlite-vs-Postgres portability bug CLAUDE.md §3.5.1 flags as a prod-breaker, plus ≥3 copy-pasted `normalizeRows()` helpers papering over it. | **High** |
| 5 | **Notification concept sprawl** — 4 schema tables + 3 route files + 2 service/lib implementations of "notifications," with overlapping names and two competing *preference* tables. | **Medium** |
| 6 | **No central tenant-scoping or audit middleware.** Tenant isolation is enforced by every route hand-writing `eq(table.tenantId, user.tenantId)`. One forgotten clause = a cross-tenant data leak. | **High** |

---

## 1. Module boundaries & coupling

### 1.1 Orphaned route modules (Critical)
`server/app.ts` is the single production router (`vercel-entry.ts` re-exports it). It imports **54**
route symbols and mounts them. But there are **95** files in `server/routes/`. ~41 route files are
**never imported by any entry point** (`app.ts`, `index.ts`, `vercel-entry.ts`, `dev-entry-contacts.ts`):

```
accounting, admissions, ai, aiChurn, aiLeads, aiSettings, apiKeys, attendance,
branchReports, branches, broadcasts, certificatesIssue, consent, forms, grades,
groups, guardians, homework, integrationTriggers, lessonPackages, makeup, messages,
mobile, parentPortal, paymentPlans, portalInvoice, progress, promoCodes, recovery,
refunds, reminders, school, settings, stripe, stripePayments, tenantSettings,
timetable, tuition, users, waitlist, webhooks
```

> **Update 2026-06-02 — 2 of these confirmed-and-fixed via real-browser e2e.** A full-app
> browser sweep ([`scripts/e2e-smoke.mjs`](../../scripts/e2e-smoke.mjs), now ~45 routes) caught
> `/app/settings/api-keys` and `/app/settings/webhooks` rendering `Unexpected token '<'` — the
> exact SPA-fallback symptom of an unmounted route. `apiKeyRoutes` was orphaned; the
> webhooks-settings backend **did not exist at all** (only the Meta-lead-ads `webhooks.ts`). Fixed:
> mounted `apiKeyRoutes` at `/api/settings/api-keys` and created
> [`server/routes/webhookSettings.ts`](../../server/routes/webhookSettings.ts) for the full
> CRUD + deliveries that `src/lib/api/webhooks.ts` already expected. **The other ~39 orphans
> remain.** Note this directly contradicts the security audit's "tenant scoping consistent in …
> apiKeys" — the route was never reachable, so its scoping had never run in prod. The CI gate in
> risk #1 (every Hono route export must be referenced in `app.ts`) is still the durable fix.

This is not harmless dead code — the **frontend already depends on several of them**:
- `src/lib/api/attendance.ts` → `GET /api/school/attendance` — `schoolRoutes` (which defines
  `/years`, `/terms`, `/classes`, `/attendance`, `/grades`) is **not mounted**. The whole School/K-12
  vertical is built end-to-end (schema + route + frontend api module + pages) and is **dead in prod**.
- `src/lib/api/messages.ts`, `accounting.ts`, `timetable.ts`, `homework.ts`, `tuition.ts`,
  `payroll.ts` similarly target unmounted routes. There is a **1:1 typed frontend API module for
  almost every backend route** (`src/lib/api/*.ts`, 62 files) — the frontend was wired for the full
  surface, but the backend never connected ~40% of it.

**Why it happened:** the autopilot built each feature on its own branch and, per its own comments,
treated `app.ts` as "contested" (owned/rewritten by the orchestrator), so newly-built routes were
frequently never merged into the central mount list. `dev-entry-contacts.ts` is a literal monument
to this: a throwaway local entry created solely to bolt the contacts route onto `app` "without
editing the contested app.ts."

**Impact:** users navigating to School, Attendance, Timetable, Homework, Accounting, Messages pages
get HTML where JSON is expected → `ApiError`/white-screen, exactly the failure class CLAUDE.md
§3.5.1ter was written to prevent. Whole milestones of work are invisible.

### 1.2 Competing/duplicated systems
- **Notifications (the recurring incident):**
  - `server/db/schema/notifications.ts` — `notification_queue` (outbound SMS/email/WhatsApp to
    leads/students, quiet-hours + anti-spam). Served by `routes/notifications.ts`? No —
    `routes/notifications.ts` actually serves **in-app** notifications from `inAppNotifications`.
  - `server/db/schema/inAppNotifications.ts` — in-app alerts to internal users. Served by
    `routes/notifications.ts` + written by `lib/createNotification.ts`.
  - `server/db/schema/notificationPreferences.ts` — per-**user** category opt-in. Served by
    `routes/notificationSettings.ts` (mounted at `/api/settings/notifications`).
  - `server/db/schema/portalNotificationPrefs.ts` — per-**student** portal prefs. Served by
    `routes/portalNotifs.ts` (mounted at `/api/portal`).
  - **Two implementations of "send a notification":** `server/services/notifications/NotificationService.ts`
    (real queue logic) **and** `server/lib/notificationService.ts` (a no-op stub with the same name and
    same `queueNotification` method signature, COMM-205 on both). A caller importing the wrong one
    silently no-ops.

  These are *arguably* four legitimately distinct concerns (outbound queue, in-app feed, user prefs,
  portal prefs), but the **naming collision** (`notificationService` class vs stub; `notifications`
  route serving `inAppNotifications`; two `*Preferences`/`*Prefs` tables) makes them indistinguishable
  at a glance and is exactly how the past "two notifications systems" incident recurs.

- **Messaging:** `services/messaging/MessagingService.ts` (provider abstraction) coexists with
  `schema/messages.ts`, `schema/directMessages.ts`, and `schema/kinderMessages.ts` — three message
  tables for tenant comms, internal DMs, and kindergarten parent messaging. Defensible domain split,
  but `routes/messages.ts` (which would tie them together) is **not mounted**.

- **Audit logging:** `routes/audit.ts`, `routes/auditLog.ts`, `routes/auditLogSettings.ts` +
  `schema/audit.ts`, `schema/auditLog.ts` + `lib/auditLogger.ts` — two audit schemas and three
  routes. Smells like two parallel audit implementations.

- **Payments/billing:** `payments`, `stripePayments`, `stripe`, `paymentPlans`, `paymentAccounts`,
  `invoices`, `refunds`, `tuition`, `recurring`, `accounting`, `payroll` — 11 route files in the
  money domain, several unmounted (`stripe`, `stripePayments`, `paymentPlans`, `tuition`,
  `accounting`, `refunds`). High risk of overlapping payment-recording paths; needs a domain owner.

---

## 2. Layering

**There is effectively no service/repository layer.** Pattern across the codebase:

```
Hono route handler → drizzle db.* directly → c.json(...)
```

- `server/services/` contains only `messaging/` and `notifications/` (proper classes taking a `DB`).
  Everything else (89 routes) inlines DB queries, business rules, and response shaping in the handler.
- `server/lib/` (29 files) is a grab-bag of *some* extracted domain logic (`automationEngine`,
  `gradebook`, `tuition`, `timetable`, `reminderCron`, `xp`) — but it's inconsistent: some domains
  have a lib module, most don't, and routes call into them ad-hoc.
- Consequence: the same query (e.g. "list students for tenant with branch scope") is reimplemented
  per route; cross-cutting rules (branch scope, soft-delete, tenant filter) can't be enforced centrally.

**This is the root cause of items 1, 4, and 6** — without a layer that owns "get tenant-scoped X,"
every route re-derives it and each can drift, forget a filter, or use the wrong DB-result accessor.

---

## 3. Cross-cutting concerns

| Concern | How it's applied | Consistency |
|---------|------------------|-------------|
| **Auth** | `requireAuth` middleware in `server/middleware/requireAuth.ts`, applied per-route (89/95 files use it). Clean, single implementation, sets `c.var.user`. | Good — the one well-factored cross-cutting piece. |
| **Tenant scoping** | **No middleware.** Each handler reads `c.get("user").tenantId` and manually adds `eq(table.tenantId, tenantId)` to every query. | **Fragile** — 91 files do this by hand; one omission = cross-tenant leak. No automated guard. |
| **Branch scoping** | `middleware/branchScope.ts` provides `getBranchScope`/`withBranchFilter` helpers, but they're *opt-in per query*, not enforced. | Partial — helper exists, application is manual and easy to forget. |
| **Validation** | `@hono/zod-validator` in 83/95 routes. | Mostly consistent; ~12 routes don't validate input. |
| **Error handling** | Single `app.onError` returns `{ error: err.message }` 500. Frontend `src/lib/api.ts` handles both string and zod error shapes. | OK at the edges, but leaking raw `err.message` to clients is an info-disclosure smell. |
| **DB-result access** | **103 raw `.rows` usages** + ≥3 duplicated `normalizeRows()` helpers. | **Bad** — the documented PGlite/Postgres portability footgun is widespread, not fixed. |

---

## 4. Frontend architecture

Generally the healthiest layer.

- **Routing:** custom `src/router/HashRouter.tsx` (hash routing for Vercel SPA). `App.tsx` is a
  reasonable 253 lines wiring 117 pages. Single router, no competing router libs.
- **API client:** strong point — a single typed `api()` helper in `src/lib/api.ts` (credentials,
  error normalization) and a **per-feature typed module** layer in `src/lib/api/*.ts` (62 modules).
  This is good separation… except it advertises ~40% more backend surface than is actually mounted
  (see §1.1). The frontend is *ahead* of the backend wiring.
- **Data fetching:** **no react-query / SWR** (0 usages). Fetching is manual (`useEffect` + `useState`
  + `api()`), with **17 files calling raw `fetch()`** directly, bypassing the `api()` client (loses
  error normalization + credentials). Inconsistent; no caching/dedup layer.
- **State:** only one context (`src/contexts/BranchContext.tsx`) and a thin `src/hooks/` set
  (`useSession`, `useBranch`, a few feature hooks). Lightweight, no global-state sprawl — fine for now,
  but the lack of a server-cache layer means each page refetches.

**Recommendation:** adopt react-query (or similar) as the single data-fetching primitive on top of
`api()`, and lint-ban raw `fetch()` in `src/pages`/`src/components`.

---

## 5. Deploy / runtime split

Three+ entry points, with drift:

| File | Role | State |
|------|------|-------|
| `server/app.ts` | **Source of truth.** Configured Hono app (all mounts, CORS, health, portable `.rows` handling). Re-exported to Vercel. | Authoritative. |
| `server/vercel-entry.ts` | Prod serverless entry. Just `getRequestListener(app.fetch)`. Well-documented rationale (avoids `api/` zero-config). | Good — thin, correct. |
| `server/index.ts` | Local single-port Node server. **Stale duplicate** of `app.ts`: redefines its own `new Hono()`, mounts only **8 routes**, and still uses `tablesResult.rows[0]` (the non-portable accessor `app.ts` fixed). | **Drift hazard.** Anyone running `server/index.ts` locally gets a 90%-missing API and a different `/api/health/db` behavior than prod. |
| `server/dev-entry-contacts.ts` | Local-only hack to mount `contactRoutes` on top of `app` because the autopilot wouldn't edit `app.ts`. | **Smell** — encodes the "contested app.ts" anti-pattern. (Contacts *is* now in `app.ts` line 113, so this file is obsolete.) |

**Risk:** `index.ts` should either import-and-serve the shared `app` (like `dev-entry-contacts` does)
or be deleted. Having two hand-maintained route lists guarantees they diverge — and `index.ts` is the
one a developer reaches for with `node server/index.ts`.

---

## 6. Tech-debt hotspots

- **God route file:** `server/routes/leads.ts` — **1,836 lines**. Plus `mobile.ts` (792),
  `analytics.ts` (674), `students.ts` (619), `invoices.ts` (580), `forms.ts` (545). These bundle many
  sub-resources (leads.ts carries tasks, attachments, contacts, conversions…) and are prime
  candidates for service extraction.
- **God lib file:** `server/lib/automationEngine.ts` (301) — central but untyped-boundary logic.
- **Schema sprawl:** 89 schema files / 88 tables; the index is complete (the §3.5.1 guardrail works),
  but the count signals over-fragmentation (e.g. 4 notification tables, 3 message tables, 2 audit
  tables, 11 money tables).
- **Dead code:** the ~41 unmounted routes are de-facto dead in prod. Either wire them or delete them —
  shipping built-but-unreachable code is the worst of both (maintenance cost, zero value, false
  confidence that the feature "exists").
- **Obsolete file:** `server/dev-entry-contacts.ts` (superseded by `app.ts` mounting contacts).

---

## Prioritized refactor recommendations

### P0 — Correctness / prod-breaking (do first)
1. **Audit & wire (or delete) the 41 orphaned routes.** For each: is the frontend calling it?
   - If yes (school, attendance, timetable, homework, messages, accounting, tuition, payroll, …) →
     **mount it in `app.ts`** and run `npm run smoke` to confirm the page works. *This is recovering
     shipped-but-invisible features.*
   - If no and obsolete → delete the file.
   *Effort: ~1–2 days. Highest value of anything here.*
2. **Collapse `server/index.ts` onto the shared `app`** (import `{ app }` from `./app`, add only the
   static-serve + `serve()`), and **delete `dev-entry-contacts.ts`**. One route list, no drift.
   *Effort: ~1 hour.*
3. **Add a `db-result` utility and ban raw `.rows`.** One `rows<T>(result)` helper in `server/db/`,
   codemod the 103 call sites, delete the 3 duplicate `normalizeRows`. Add an ESLint rule / the
   existing test gate to forbid `.execute(...).rows`. *Effort: ~half a day (mostly mechanical).*

### P1 — Safety / consistency
4. **Tenant-scope middleware or repository layer.** Introduce a thin per-tenant data accessor (or a
   middleware that injects a tenant-bound `db` proxy) so handlers can't query unscoped. At minimum,
   add a test that greps for `db.select().from(<tenant table>)` without a `tenantId` filter.
   *Effort: ~2–3 days for a repository pattern; ~1 day for a lint/test guard as a stopgap.*
5. **Disambiguate notifications.** Rename to make the four concerns obvious and delete the stub:
   - `notification_queue` → keep; route `routes/notifications.ts` is mislabeled (serves in-app) →
     rename to `inAppNotificationRoutes` / mount path `/api/in-app-notifications`.
   - Delete `server/lib/notificationService.ts` (no-op stub colliding with the real service); point
     all callers at `services/notifications/NotificationService`.
   - Document the four tables in a one-paragraph header in `schema/index.ts`.
   *Effort: ~half a day.*
6. **Stop leaking `err.message` from `app.onError`.** Map to a generic message + a logged correlation
   id in prod. *Effort: ~1 hour.*

### P2 — Structural / long-term
7. **Introduce a service layer incrementally**, starting with the money domain (consolidate the 11
   payment routes behind a `BillingService`) and `leads.ts` (extract tasks/contacts/conversions into
   services). Use the existing `services/messaging` + `services/notifications` as the template.
   *Effort: ongoing; ~1–2 days per large domain.*
8. **Adopt react-query on top of `api()`** and lint-ban raw `fetch()` in components/pages.
   *Effort: ~1–2 days incremental.*
9. **Consolidate audit logging** to one schema + one route. *Effort: ~half a day.*

---

## Process note (root cause)
Nearly every finding traces to one mechanism: the autopilot built features on isolated branches but
treated the central wiring points (`app.ts`, the service layer) as contested/owned, so the
**integration step was skipped**. The `integration-architect` agent (CLAUDE.md §3.5.2) exists for
exactly this — the gap is that "is this route actually mounted and reachable end-to-end?" was not an
enforced gate. **Recommendation:** add a CI check that fails if any `server/routes/*.ts` exporting a
Hono app is not referenced by `server/app.ts`, and extend `npm run smoke` to hit one endpoint per
mounted module. That single gate would have caught the 41 orphaned routes.
