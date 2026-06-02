# Vector Learn — Performance Audit
**Date:** 2026-06-02  
**Auditor:** Performance Engineer  
**Scope:** Frontend bundle, server routes (N+1 queries, missing pagination), React render perf, images

---

## Bundle Size Measurements (Vite build, gzip)

| Chunk | Raw | Gzip | Status |
|---|---|---|---|
| `index-BmyOO1Q5.js` (monolithic app) | 3,403 KB | **723 KB** | CRITICAL — 7× over budget |
| `pdf-Dk_XKybW.js` (jspdf + related) | 472 KB | 140 KB | Over budget |
| `html2canvas.esm-CBrSDip1.js` | 201 KB | 48 KB | Bundled eagerly |
| `index.es-Sq5F79jF.js` | 151 KB | 51 KB | Acceptable standalone |
| `purify.es-BSKMTLSQ.js` | 26 KB | 10 KB | Fine |
| `index-Qnz6_vwc.css` | 86 KB | **15 KB** | Fine |
| **Total JS delivered** | **5,905 KB** | **~985 KB** | Project budget: ≤100 KB/route |

**Build note:** `tsc -b` fails (schema drift in test files + stale Group/Invoice types), but Vite itself compiles cleanly. The 723 KB gzip monolith is the primary crisis.

---

## Findings — Ranked by Impact

---

### P1 — CRITICAL: Zero route-level code splitting; 77 pages in one 723 KB bundle

**Impact:** Every route — including the public landing page (`/`) and the unauthenticated invoice portal (`/portal/invoice/:id`) — pays the full 723 KB JS parse cost. On simulated 3G (~1.6 Mbps) that is ~3.6 s of download before any JS executes, destroying Lighthouse Performance and LCP.

**File:** `src/App.tsx:1–253`

**Root cause:** All 77 page components are statically imported at the top of `App.tsx`. There is no `React.lazy()` call anywhere in the codebase. Vite therefore emits a single giant chunk.

**Confirmed heavy pages in the monolith:**
- `DiplomaPage` statically imports `@/lib/certificateRender` (pulls in `jspdf` + `qrcode`) and `@/lib/certificateZip` (pulls in `jszip`). These alone account for roughly **340 KB gzip** of the chunk.
- `InvoicePortalPage` statically imports `@/lib/epcQr` which statically imports `qrcode`.
- `RevenueChartsPage` is the sole importer of `recharts` (~150 KB gzip).
- `AdvancedAnalyticsPage`, `KpiDashboardPage`, `StudentRetentionPage`, `RevenueChartsPage` are all data-heavy pages that are never needed on first load.

**Fix — priority order:**
1. Wrap every page import in `React.lazy()` + `<Suspense>` — one pass through `App.tsx`.
2. Separately, convert the static imports in `DiplomaPage.tsx:36–37` to dynamic `import()` calls triggered on user action (the PDF/ZIP export button), not at module parse time. Same for `InvoicePortalPage` → `epcQr`.
3. Add `build.rollupOptions.output.manualChunks` in `vite.config.ts` to separate vendor groups: `{ vendor-charts: ['recharts'], vendor-pdf: ['jspdf', 'jszip', 'qrcode'], vendor-react: ['react', 'react-dom'] }`.

**Expected outcome:** Landing page and login route drop to ~80–100 KB gzip. Diploma/invoice routes load their heavy deps only when the user hits those routes or clicks the export action.

---

### P2 — HIGH: N+1 query storm in `GET /api/analytics/branches` — 3 DB round-trips per branch

**Impact:** For a tenant with 10 branches: 1 (branch list) + 30 (3 × 10 individual KPI queries) = 31 sequential DB queries. On Supabase with ~5 ms RTT each, that is ~155 ms of pure DB wait before any computation. Scales linearly with branch count.

**File:** `server/routes/analytics.ts:301–357` — `Promise.all(branchList.map(async (branch) => { ... }))` runs three separate `db.select()` calls per branch.

**Fix:** Replace with three bulk queries (one per metric), then aggregate in JS:
```
-- 1. Active students per branch (single GROUP BY query)
-- 2. MRR per branch (single GROUP BY with JOIN, same date filter)
-- 3. Lessons per branch (single GROUP BY, same date filter)
```
All three already have the data needed for a `GROUP BY students.branch_id` / `GROUP BY payments → students.branch_id` / `GROUP BY lessons.branch_id` shape. Reduces 31 queries to 4 (1 branch list + 3 aggregations).

---

### P3 — HIGH: N+1 in `PATCH /api/lessons/:id/attendance` (batch check-in) — up to 200 serialized queries per request

**Impact:** The batch attendance endpoint at `server/routes/lessons.ts:436–469` iterates up to 200 students in a `for` loop, calling `db.query.studentLessons.findFirst()` + `db.update()` or `db.insert()` per student. This is 2–3 DB round-trips × 200 students = up to 600 sequential queries. The mobile check-in page sends this on every lesson. On PGlite locally it is imperceptible; on Supabase with latency it can take 3–10 seconds per check-in batch.

**File:** `server/routes/lessons.ts:436–469`

**Fix:** 
1. Single `SELECT` to fetch all existing `studentLessons` rows for this lesson in one query (`WHERE lessonId = X AND studentId IN (...)`).
2. Partition updates vs inserts in JS.
3. Batch `INSERT ... ON CONFLICT DO UPDATE` (Drizzle's `.onConflictDoUpdate()`) for the whole set.
Result: 1 select + 1 upsert = 2 round-trips regardless of class size.

---

### P4 — HIGH: `GET /api/payments` returns unbounded rows (no pagination)

**Impact:** For an academy with 1,400 students × 12 months = potentially 16,000+ payment rows returned in a single JSON response. Network payload can reach several MB; the browser renders all rows synchronously.

**File:** `server/routes/payments.ts:26–50`

**Fix:** Add `limit`/`offset` (or cursor) query params, defaulting to `limit=100`. The PaymentsPage frontend should implement virtual scrolling or pagination UI — it currently renders a flat list. Companion fix: add a composite index `(tenant_id, paid_at DESC)` to support the new time-window filter queries used in analytics without full-table scans (see P6).

**Also unbounded:**
- `GET /api/lessons` (`server/routes/lessons.ts:100–130`) — returns all lessons for a tenant in a date range with no row cap. A full year of lessons for 6 branches could be 50,000+ rows.
- `GET /api/invoices` (`server/routes/invoices.ts:35–80`) — no pagination, only optional status/month filters.
- `GET /api/contracts` — no pagination.

---

### P5 — HIGH: Payment plan progress uses `notes LIKE '%planId%'` — full index scan

**Impact:** Every call to `GET /api/payment-plans` runs one `WHERE notes LIKE '%planId%'` query per plan (N+1 on top of the N+1). The leading `%` wildcard makes this a sequential scan on the entire `invoices` table for the tenant. With 16,000+ invoices this can take >1 s per plan.

**File:** `server/routes/paymentPlans.ts:135` and `:172`

**Root cause:** `invoices` has no `plan_id` foreign key column. Plans are linked to invoices by embedding the plan UUID in the invoice's `notes` text field.

**Fix:**
1. Add `plan_id uuid REFERENCES payment_plans(id)` column to the `invoices` table via migration.
2. On plan creation (`paymentPlans.ts POST /`), set `planId` on each generated invoice.
3. Replace `LIKE '%planId%'` with `WHERE plan_id = X` — this is index-covered by the existing `invoices_tenant_idx`.

---

### P6 — MEDIUM: Missing composite index on `payments(tenant_id, paid_at)` — analytics full scans

**Impact:** `GET /api/analytics/branches` joins `payments` filtered by `paid_at BETWEEN periodStart AND periodEnd` for each branch. The existing `payments_status_idx(tenant_id, status)` does not cover `paid_at`. Postgres falls back to a sequential scan on all tenant payments, then filters by date. For a tenant with 16,000 payments this is a full scan repeated per request.

**Schema file:** `server/db/schema/payments.ts:42–44` — no `paid_at` index defined.

**Fix:** Add to the schema's `(t) => ({...})` block:
```ts
paidAtIdx: index("payments_paid_at_idx").on(t.tenantId, t.paidAt),
```
Generate and commit the migration. This also benefits `GET /api/payments/stats` (monthly paid sum).

---

### P7 — MEDIUM: N+1 in `GET /api/groups` — 2 count queries per group

**Impact:** `server/routes/groups.ts:52–70` fetches group list then runs `Promise.all(items.map(async (g) => { SELECT count FROM groupEnrollments; SELECT count FROM groupWaitlist; }))`. For 20 groups: 41 queries. Groups page is shown frequently.

**Fix:** Replace with two bulk GROUP BY counts:
```sql
SELECT group_id, count(*) FROM group_enrollments WHERE group_id IN (...) GROUP BY group_id;
SELECT group_id, count(*) FROM group_waitlist WHERE group_id IN (...) GROUP BY group_id;
```
Then merge into the JS result. Net: 1 group list query + 2 aggregation queries = 3 total.

---

### P8 — MEDIUM: N+1 in `GET /api/feedback` list — 2 queries per feedback form

**Impact:** `server/routes/feedback.ts:58–90` runs `Promise.all(formList.map(async (form) => { fetchInvitations + fetchScores }))` — two queries per form. A tenant with 10 forms = 21 queries. Executed on every Feedback page load.

**Fix:** Single `GROUP BY form_id` query on `feedbackInvitations` for counts + status. Single `GROUP BY feedbackAnswers.formId` aggregated query for averages. Both can be done with a single CTE if needed.

---

### P9 — MEDIUM: N+1 in subscription billing loop — serial `SELECT MAX + INSERT + UPDATE` per subscription

**Impact:** `POST /api/invoices/subscriptions/run-billing` (`invoices.ts:414–457`) iterates each due subscription and runs 3 sequential DB queries (SELECT MAX number, INSERT invoice, UPDATE subscription). For a tenant with 50 active subscriptions: 150 DB round-trips in a single HTTP request. This is a background batch job triggered manually, but it can time out on Vercel (10 s limit) with large subscription sets.

**Fix:** Compute `MAX(number)` once before the loop. Use `db.insert(invoices).values([...all invoices...])` bulk insert. Use `db.update` batched with Drizzle's `sql.join` or individual promise-all for the date advance. Reduce to 3 DB operations total regardless of subscription count.

---

### P10 — MEDIUM: N+1 in `GET /api/school/classes` — full enrollment fetch per class

**Impact:** `server/routes/school.ts:276–295` fetches all enrollment rows (not just a count) for each class, then computes `.length` in JS. For 30 classes: 31 queries. Uses `SELECT status FROM classEnrollments WHERE classId = X` — no COUNT, fetches full rows just to count them.

**Fix:** Single aggregation query: `SELECT class_id, COUNT(*) FROM class_enrollments WHERE status='active' AND class_id IN (...) GROUP BY class_id`.

---

### P11 — MEDIUM: N+1 in `GET /api/mobile/leaderboard` — XP sum query per student

**Impact:** `server/routes/mobile.ts:766–780` runs `Promise.all(optInStudents.map(async (s) => { SELECT SUM(xpEvents.amount) WHERE studentId = s.id }))`. For 30 opt-in students = 31 queries. Could be a single `GROUP BY student_id`.

**Fix:** `SELECT student_id, SUM(amount) FROM xp_events WHERE tenant_id = X AND student_id IN (...) GROUP BY student_id`.

---

### P12 — MEDIUM: `GET /api/audit-log/export` returns up to 5,000 rows per request

**Impact:** `server/routes/auditLog.ts:64` uses `.limit(5000)` with no pagination option exposed. For active tenants, 5,000 rows × multiple join columns = a large JSON response serialized synchronously. Audit logs grow unboundedly.

**Fix:** Add cursor-based pagination (`after_id` or `before_date`). The CSV export use-case should stream the response rather than accumulating in memory.

---

### P13 — LOW: `GET /api/payments/stats` fires 3 separate aggregate queries instead of 1

**Impact:** `server/routes/payments.ts:52–79` runs three separate `SELECT SUM(amount_cents)` queries (paid, pending, overdue) with the same `tenantId` filter. This is 3 round-trips where 1 suffices.

**Fix:**
```sql
SELECT 
  SUM(CASE WHEN status='paid' AND paid_at >= monthStart THEN amount_cents ELSE 0 END) AS paid,
  SUM(CASE WHEN status='pending' THEN amount_cents ELSE 0 END) AS pending,
  SUM(CASE WHEN status='overdue' THEN amount_cents ELSE 0 END) AS overdue
FROM payments WHERE tenant_id = X
```
One query, same result.

---

### P14 — LOW: `GET /api/feedback/:id` — per-question answer fetch (N questions × 1 query each)

**Impact:** `server/routes/feedback.ts:158–180` runs one `SELECT answers WHERE questionId = Q` per numeric question in a form. For a form with 10 rating questions = 11 queries.

**Fix:** Single query: `SELECT question_id, AVG(CAST(value AS numeric)) FROM feedback_answers JOIN feedback_invitations ON ... WHERE form_id = X AND question_type IN ('rating', 'nps') GROUP BY question_id`.

---

### P15 — LOW: N+1 in `GET /api/payment-plans` — per-plan invoice fetch (compounded with LIKE scan)

Already partially covered by P5. The N+1 structure (`paymentPlans.ts:130–152`) also misses caching: plan progress is recomputed on every list request. After adding the `plan_id` FK (P5), consider caching the `paidAmount` as a denormalized column updated on invoice status change.

---

### P16 — LOW: N+1 in `GET /api/cadences` — active enrollment count per cadence

**Impact:** `server/routes/cadences.ts:63–76` runs one count query per cadence. For 20 cadences = 21 queries.

**Fix:** `SELECT cadence_id, COUNT(*) FROM lead_cadence_enrollments WHERE status='active' AND cadence_id IN (...) GROUP BY cadence_id`.

---

### P17 — LOW: N+1 in `GET /api/analytics/revenue-by-teacher` — lesson fetch, then separate student-lesson lookup for all lesson IDs

**Impact:** `server/routes/analytics.ts:446–556` — separate queries for teachers, lessons, invoices, then studentLessons. While not a per-row N+1, it is 5 sequential queries that could collapse to 2 (teacher-lesson-student join + invoice aggregation).

---

### P18 — LOW: No HTTP response caching on read-heavy analytics endpoints

**Impact:** `GET /api/analytics/crm/funnel`, `/crm/roas`, `/retention-by-course`, `/churn-risk` are computed from scratch on every request with no `Cache-Control` header. These queries are expensive and the underlying data changes at most a few times per hour.

**Fix:** Add `Cache-Control: public, max-age=300, stale-while-revalidate=60` on the analytics GET endpoints. For per-tenant data, use `private, max-age=60`. No infrastructure changes needed — Hono supports `c.header()`.

---

### P19 — LOW: React render — 77 pages without `React.memo`, large list renders without keys or virtualization

**Impact:**
- `StudentsPage` renders up to 500 student cards (current server-side limit) without virtualization. Scrolling is janky at large datasets.
- `LeadsPage` renders kanban cards for all leads returned (up to 200 per page via `pageSize` param).
- Neither page uses `React.memo` on individual card components, so re-renders on parent state changes cascade through all cards.

**File:** `src/pages/app/StudentsPage.tsx`, `src/pages/app/LeadsPage.tsx`

**Fix:** 
1. Add `React.memo()` to card components (`StudentCard`, kanban lead card).
2. For the students table view: if rendered count > 100, switch to `react-window` `FixedSizeList` or `AutoSizer` + `VariableSizeList`.

---

### P20 — LOW: `src/pages/app/KinderDiaryPage.tsx:350` — `<img>` without `loading="lazy"`

**Impact:** The photo diary renders up to N diary event images without lazy loading. Images load eagerly even if off-screen.

**Fix:** `<img src={event.photoUrl} alt="fotografie" className="..." loading="lazy" />`

---

## Summary Table

| # | Area | File(s) | Impact | Effort |
|---|---|---|---|---|
| P1 | Bundle: no code splitting, 723 KB gzip monolith | `src/App.tsx`, `vite.config.ts` | Critical | Medium |
| P2 | N+1: 3 queries/branch in analytics | `server/routes/analytics.ts:301` | High | Low |
| P3 | N+1: 2–600 queries/request in batch attendance | `server/routes/lessons.ts:436` | High | Low |
| P4 | Pagination missing: payments, lessons, invoices | `payments.ts:26`, `lessons.ts:100`, `invoices.ts:35` | High | Low |
| P5 | LIKE '%planId%' scan instead of FK join | `server/routes/paymentPlans.ts:135` | High | Medium (migration) |
| P6 | Missing index: payments.paidAt | `server/db/schema/payments.ts` | Medium | Low |
| P7 | N+1: 2 count queries/group in groups list | `server/routes/groups.ts:52` | Medium | Low |
| P8 | N+1: 2 queries/form in feedback list | `server/routes/feedback.ts:58` | Medium | Low |
| P9 | N+1: serial billing loop (SELECT MAX inside loop) | `server/routes/invoices.ts:414` | Medium | Low |
| P10 | N+1: enrollment fetch (not count) per class | `server/routes/school.ts:276` | Medium | Low |
| P11 | N+1: XP sum per student in leaderboard | `server/routes/mobile.ts:766` | Medium | Low |
| P12 | Unbounded: audit log exports 5,000 rows | `server/routes/auditLog.ts:64` | Medium | Low |
| P13 | 3 aggregate queries where 1 suffices | `server/routes/payments.ts:57` | Low | Trivial |
| P14 | N+1: answer fetch per question in feedback | `server/routes/feedback.ts:158` | Low | Low |
| P15 | N+1: invoice LIKE scan per payment plan | `server/routes/paymentPlans.ts:130` | Low | Covered by P5 |
| P16 | N+1: enrollment count per cadence | `server/routes/cadences.ts:63` | Low | Trivial |
| P17 | 5 sequential queries in revenue-by-teacher | `server/routes/analytics.ts:446` | Low | Low |
| P18 | No HTTP caching on analytics endpoints | `server/routes/analytics.ts` | Low | Trivial |
| P19 | No list virtualization, no React.memo on cards | `StudentsPage.tsx`, `LeadsPage.tsx` | Low | Medium |
| P20 | img without loading=lazy in KinderDiaryPage | `KinderDiaryPage.tsx:350` | Low | Trivial |

---

## Recommended Fix Order

**Sprint 1 (highest ROI, mostly server-side):**
1. P1 — Route-level code splitting (`React.lazy` in App.tsx + `manualChunks` in vite.config.ts). Single PR, dramatic improvement.
2. P2 — analytics/branches: replace N+1 with 3 bulk GROUP BY queries.
3. P3 — batch attendance: single upsert replacing the serial loop.
4. P4 — Add `limit`/`offset` to `GET /api/payments`, `GET /api/lessons`, `GET /api/invoices`.
5. P5 + P6 — Add `plan_id` FK to invoices (migration) + `payments.paidAt` index (migration).

**Sprint 2 (medium impact):**
6. P7, P8, P10, P11, P16 — bulk COUNT queries replacing per-row N+1 patterns.
7. P9 — Billing loop: compute MAX once, bulk insert.
8. P13 — Consolidate 3 payment stats queries into 1.
9. P18 — Add Cache-Control headers to analytics routes.

**Sprint 3 (UX polish):**
10. P12 — Paginate audit log export.
11. P19 — React.memo on card components; react-window for large lists.
12. P20 — lazy loading on diary images.
