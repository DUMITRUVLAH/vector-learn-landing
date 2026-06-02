# Scalability / Capacity Audit — Vector Learn at 1,000 Concurrent Users

**Date:** 2026-06-02  
**Auditor:** SRE agent  
**Scope:** Read-only analysis. No code was modified.

---

## 1. Failure Cascade at 1,000 Concurrent Users (ranked)

### Stage 1 — Supabase pgBouncer pool exhaustion (seconds to minutes, catastrophic)

This is the first and most severe failure.

The configuration in `server/db/client.ts:50-53` is correct for serverless — `max:1` per function instance, pooled port `:6543`, `prepare:false`, `fetch_types:false`. The problem is **arithmetic across Vercel's concurrency model**.

Vercel's classic serverless (Build Output API v3, `launcherType: Nodejs`) spins one Node process per concurrent in-flight request. With `max:1` set per process, 1,000 concurrent requests = 1,000 simultaneous pgBouncer client connections attempted.

Supabase pgBouncer limits by plan:
- **Free:** 15–20 pooler client connections (effectively unusable above ~20 concurrency).
- **Pro ($25/mo):** 200 pooler client connections.
- **Team ($599/mo):** 500+ depending on compute add-on.

At 1,000 concurrent users making authenticated requests (each passes through `requireAuth`, which runs **two DB queries** — `sessions.findFirst` + `users.findFirst` — before the route even executes), the pooler saturates at the plan's `max_client_conn` ceiling. New connections get `sorry, too many clients already` from pgBouncer. `connect_timeout:10` means each blocked function waits 10 seconds before returning 500. The function queue backs up, Vercel starts queuing or dropping incoming requests, and the app falls over entirely.

**Quantified:** Pro plan (200 client connections) saturates at approximately 180–200 concurrent authenticated API calls, not 1,000.

**Additional amplifier from auth:** Every single authenticated request (any route behind `requireAuth`) runs at minimum 2 DB queries serially — `findFirst` on `sessions`, then `findFirst` on `users`. The `getSessionUser` function also fires a third fire-and-forget `UPDATE sessions SET lastActiveAt` per call. That is 3 DB round-trips consumed before the route handler begins, holding the pgBouncer slot for the duration of those round-trips.

### Stage 2 — N+1 and unpaginated queries amplify connection hold time (concurrent with Stage 1)

While the pool is saturating, connection slots are held longer by expensive queries. This compounds Stage 1.

**`GET /api/analytics/branches`** (`server/routes/analytics.ts:301`): Fetches all active branches for the tenant, then runs `Promise.all(branchList.map(async (branch) => { ... }))` — 3 separate DB queries per branch (active student count, MRR sum, lesson count). With 6 branches, that is 1 initial query + 18 concurrent queries = 19 queries per request. At 100 simultaneous dashboard loads, this route alone fires 1,900 queries. At 1,000 users: 19,000 queries, all competing for 200 pooler slots.

**`GET /api/analytics/churn-risk`** (`analytics.ts:567`): Fetches all active students (no limit) then runs 2 additional aggregation queries across `studentLessons` joined to `lessons`. On a tenant with 500 active students, the student fetch alone returns 500 rows; the two joins scan `studentLessons` unindexed on `attendanceStatus`.

**`GET /api/analytics/retention-by-course`** (`analytics.ts:363`): Fetches all courses, then two broad `studentLessons`+`lessons` joins scanning 30-day and 60-day windows with no date-range index on `studentLessons`.

**`PATCH /api/lessons/:id/attendance`** (`lessons.ts:436`): The batch attendance endpoint iterates `updates` (up to 200 students) in a **serial `for` loop** — `findFirst` + `update`/`insert` per student. A 200-student class check-in = 400 sequential DB round-trips on a single function invocation, holding one pgBouncer slot for the entire duration.

**`GET /api/payments/`** (`payments.ts:26-49`): No `.limit()`. Returns every payment row for the tenant ordered by `createdAt DESC`. A tenant with 10,000 payment records returns all 10,000 on every list load. Same pattern in `GET /api/invoices/` (`invoices.ts:55`): no `.limit()`, returns all invoices.

**`GET /api/analytics/revenue-by-teacher`** (`analytics.ts:446`): Fetches all lessons in last 30 days, all paid invoices in last 30 days, then does an `ANY(ARRAY[...uuid...])` query with potentially thousands of IDs in the array — a pattern that bypasses index scans in Postgres for large arrays.

### Stage 3 — In-memory state corruption under serverless concurrency (silent failures)

Two in-process stores exist that silently break under serverless:

**`server/routes/leads.ts:44`** — `const undoStore = new Map<string, UndoEntry>()`. This holds undo tokens for deleted leads with a 35-second TTL. Under serverless, each function instance has its own `undoStore`. An undo request routed to a different instance than the one that created the token will always get `token_not_found`, making the undo feature 100% non-functional at scale (with multiple warm instances).

**`server/routes/certificatesPublic.ts:25`** — `const rateLimitMap = new Map<string, { count: number; resetAt: number }>()`. The in-process IP rate limiter is per-instance. A burst of 30 requests from the same IP distributed across multiple instances will bypass the rate limit entirely. `setInterval` for pruning (`certificatesPublic.ts:42`) also fires per-instance — inconsequential for correctness but wasteful.

### Stage 4 — Missing indexes cause sequential scans under load (degradation, not instant failure)

Tables without indexes on their hot query columns:

- **`payments.paidAt`**: `GET /api/analytics/*` filters on `payments.paidAt >= periodStart`. No index — full tenant payment table scan on every analytics call.
- **`invoices.dueDate`**: Used in overdue-invoice queries. No index — full tenant invoice table scan.
- **`xpEvents` table** (`server/db/schema/gamification.ts`): No indexes defined at all on `tenantId`, `studentId`, or `occurredAt`. Any XP-related query at scale is a seq-scan.
- **`directMessages` table** (`server/db/schema/directMessages.ts`): No indexes on `tenantId`, `fromUserId`, `toUserId`. Direct message queries degrade linearly with table size.

Under light load these scans complete in <5ms. Under 1,000 concurrent users where each scan competes for Postgres CPU and I/O, they serialize, lock pages, and push query times to 100–500ms — which holds pgBouncer slots longer and feeds Stage 1.

### Stage 5 — 723 KB gzip JS bundle blocks first paint for every new user (steady-state degradation)

The frontend is a monolithic Vite bundle with zero `React.lazy`. Every new visitor downloads 723 KB gzip (confirmed by prior audit) before seeing anything. Under 1,000 concurrent users, this means:
- All static assets ARE served from Vercel's CDN edge — this part scales well.
- However, every new browser session fires 4–8 API calls immediately on load (auth check, tenant config, initial data). This multiplies the DB connection pressure described in Stage 1.

No CDN cache headers are set on any API endpoint. Every `GET /api/analytics/branches` by 1,000 users = 1,000 identical DB-hitting requests even when the data is the same for all users of a tenant.

### Stage 6 — External API calls block function slots synchronously

**`server/lib/companyRegistry.ts:82`** (`UPSTREAM_TIMEOUT_MS = 12_000`): The contafirm.md registry proxy holds a function slot for up to 12 seconds waiting for an external HTTP response. Under load, if contafirm.md is slow, Vercel functions back up on these 12-second holds. No caching layer sits in front of this — every registry search is a live external call.

**`server/lib/webhookDispatch.ts:89`**: Outbound webhook delivery is synchronous within the request lifecycle. A slow customer webhook endpoint (customer's server is down, times out) holds the Vercel function slot for the webhook's timeout duration.

> **Now LIVE, not theoretical (2026-06-02):** the webhooks-settings backend was created and mounted this session (`server/routes/webhookSettings.ts`), so customers can finally register outbound endpoints. Until now the dispatch path had no endpoints to fan out to, so this risk was dormant. With real endpoints configured, **Code Fix 5 (move webhooks off the request path) moves up in priority** — a single customer with a dead endpoint can now hold function slots under load. Pair the new CRUD route with an async/queued dispatcher before promoting webhooks in the product.

---

## 2. Infrastructure Changes (ranked by impact, with specific settings)

### Fix 1 — Enable Vercel Fluid Compute (impact: massive, cost: zero)

**Current behavior:** Classic serverless — 1 Node process per concurrent in-flight request. 1,000 concurrent requests = up to 1,000 processes = up to 1,000 pgBouncer connections.

**Fluid Compute behavior:** One warm function instance can handle multiple concurrent invocations by multiplexing them on the same event loop. A single instance running 20 concurrent requests still holds only 1 pgBouncer connection (the `max:1` client). At 1,000 concurrent requests distributed across 50 warm instances, the pooler sees 50 connections instead of 1,000.

**How to enable:** In `vercel.json`, add:
```json
{
  "functions": {
    "api/index.func": {
      "fluid": true
    }
  }
}
```
Or enable at the project level in Vercel dashboard → Project Settings → Functions → Fluid Compute toggle.

**Expected reduction in pooler connections:** 95%+. This is the single highest-leverage change in the entire stack.

**Caveat:** Fluid Compute requires the runtime to be async-safe (no blocking synchronous I/O). The current Hono+postgres-js stack is fully async — no concern here. The serial `for` loops (lessons attendance) will continue to hold the instance for their duration, but they won't exhaust the pooler.

### Fix 2 — Upgrade Supabase compute and set explicit pooler limits

**Current risk:** Even with Fluid Compute, connection count grows with Vercel instance count. Supabase Free's 15–20 pooler client connections hard-fail at tiny scale.

**Minimum viable:** Supabase Pro ($25/mo).
- Sets `max_client_conn` to 200 on the pgBouncer pooler.
- `default_pool_size` (connections from pgBouncer to Postgres) defaults to 15 per database user. This should be tuned to match the Postgres `max_connections` headroom.

**Recommended tuning** (set via Supabase Dashboard → Database → Connection Pooling):
```
max_client_conn = 1000      # allow 1000 frontend connections to pgBouncer
default_pool_size = 25      # pgBouncer → Postgres connections per db user
pool_mode = transaction     # already correct (transaction mode)
```

With Fluid Compute (Fix 1) handling 50 Vercel instances at 1,000 concurrent requests, 50 pgBouncer client connections suffice — but headroom to 1,000 client connections absorbs burst spikes and mis-behaving clients.

**Supabase compute add-on:** The free/nano compute gives the Postgres instance 0.25 vCPU and 512 MB RAM. At 1,000 concurrent users firing analytics queries (which do multi-table joins), the DB CPU will saturate before the connection pool does. Upgrade to Supabase Small compute (2 vCPU, 1 GB RAM, ~$15/mo) minimum; Medium (4 vCPU, 2 GB RAM, ~$50/mo) for headroom.

### Fix 3 — Add Redis/Upstash for session caching, rate limiting, and hot reads

**Session DB cost:** Every authenticated API request fires 2 serial DB queries (sessions lookup + users lookup) plus 1 fire-and-forget update. At 1,000 RPS this is 2,000 guaranteed DB hits before any business logic runs.

**Solution:** Cache sessions in Redis/Upstash (serverless-compatible) with a 5-minute TTL. The `getSessionUser` function in `server/auth/session.ts` becomes: `redis.get(token)` → hit: return cached user; miss: DB lookup + `redis.set(token, user, ex: 300)`.

**Expected DB query reduction:** 80–90% of auth-related queries eliminated on warm sessions.

**Rate limiting:** Replace the per-instance in-process `rateLimitMap` in `certificatesPublic.ts` and `undoStore` in `leads.ts` with Upstash Redis atomic operations (`INCR` + `EXPIRE` for rate limiting; `SET`/`GET` with TTL for undo tokens). This fixes both the correctness bug (same user hitting different instances) and the capacity issue.

**Hot analytics reads:** Cache `GET /api/analytics/branches` per `tenantId` for 60 seconds. At 1,000 users in a tenant, this reduces 1,000 19-query bursts to a single DB hit per minute.

**Upstash cost:** Free tier handles 10,000 commands/day; Pay-per-use tier is $0.20 per 100k commands. At 1,000 concurrent users with session caching, estimate ~500k commands/day = ~$1/day.

### Fix 4 — Add CDN cache headers for cacheable GET endpoints and the JS bundle

**API responses that are safe to cache at the CDN edge:**

| Endpoint | Suggested cache | Rationale |
|---|---|---|
| `GET /api/analytics/branches` | `Cache-Control: private, max-age=60` | Per-tenant, changes at most every minute |
| `GET /api/analytics/crm/funnel` | `private, max-age=30` | Summary aggregation |
| `GET /api/courses` | `private, max-age=300` | Course catalog changes rarely |
| `GET /api/rooms` | `private, max-age=3600` | Almost never changes |
| `GET /api/badges/leaderboard` | `private, max-age=60` | Acceptable staleness |

Note: `private` prevents Vercel's CDN from sharing responses across users, but it allows browser caching. For tenant-isolated data (all authenticated routes), `private` is mandatory.

**Static bundle:** The 723 KB JS bundle is already served from Vercel CDN with immutable hashes (Vite content-hashing). This is already optimal — no change needed for the static assets themselves.

**Impact:** With 60-second caching on analytics routes, 1,000 concurrent users of a tenant reduce analytics DB load from 19,000 queries/minute to ~19 queries/minute.

### Fix 5 — Add missing indexes on hot query columns

These indexes address Stage 4 seq-scans. Add to the respective schema files and generate a migration:

**`server/db/schema/payments.ts`** — add:
```typescript
paidAtIdx: index("payments_paid_at_idx").on(t.tenantId, t.paidAt),
```
Used by: analytics ROAS, MRR calculation, branch KPI queries filtering `paidAt >= periodStart`.

**`server/db/schema/invoices.ts`** — add:
```typescript
dueDateIdx: index("invoices_due_date_idx").on(t.tenantId, t.dueDate),
issueDateIdx: index("invoices_issue_date_idx").on(t.tenantId, t.issueDate),
```
Used by: overdue invoice queries, recurring billing, e-Factura monthly export.

**`server/db/schema/gamification.ts` (`xpEvents` table)** — add indexes:
```typescript
// Currently no indexes at all — full seq scan on every XP query
tenantStudentIdx: index("xp_events_tenant_student_idx").on(t.tenantId, t.studentId),
occurredAtIdx: index("xp_events_occurred_at_idx").on(t.tenantId, t.occurredAt),
```

**`server/db/schema/directMessages.ts`** — add:
```typescript
tenantToIdx: index("dm_tenant_to_idx").on(t.tenantId, t.toUserId),
tenantFromIdx: index("dm_tenant_from_idx").on(t.tenantId, t.fromUserId),
```

**`server/db/schema/lessons.ts` (`studentLessons` table)** — add composite:
```typescript
attendanceIdx: index("sl_attendance_idx").on(t.tenantId, t.attendanceStatus, t.markedAt),
```
Used by: churn-risk (absences query), badge awardal logic (4 separate queries on `attendanceStatus`).

---

## 3. Function / Code Changes Ranked by Impact

### Code Fix 1 — Batch the attendance update loop (lessons.ts:436)

**Current:** Serial `for` loop with 2 DB operations per student (findFirst + update/insert). Max 200 students = 400 sequential DB round-trips per request.

**Fix:** Use `INSERT ... ON CONFLICT DO UPDATE` (upsert) in a single batch statement:
```typescript
await db.insert(studentLessons)
  .values(updates.map(({ studentId, status }) => ({
    tenantId, lessonId, studentId,
    attendanceStatus: status, markedBy: user.id, markedAt: now,
  })))
  .onConflictDoUpdate({
    target: [studentLessons.lessonId, studentLessons.studentId, studentLessons.tenantId],
    set: { attendanceStatus: sql`excluded.attendance_status`, markedBy: sql`excluded.marked_by`, markedAt: sql`excluded.marked_at` },
  });
```
**Impact:** 400 sequential DB round-trips → 1 batch statement. Function duration for a 200-student class drops from ~20s to ~50ms.

### Code Fix 2 — Rewrite analytics/branches to a single SQL query

**Current** (`analytics.ts:301`): `Promise.all(branchList.map(async (branch) => 3 queries))` = 1 + 3N queries for N branches. 6 branches = 19 queries per analytics dashboard load. At 100 concurrent analytics users = 1,900 queries.

**Fix:** Single aggregation query with conditional `SUM` and `COUNT` grouped by `branches.id`:
```sql
SELECT b.id, b.name,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active') AS active_students,
  SUM(p.amount_cents) FILTER (WHERE p.status = 'paid' AND p.paid_at >= $periodStart) AS mrr,
  COUNT(DISTINCT l.id) FILTER (WHERE l.scheduled_at >= $periodStart) AS lessons_this_month
FROM branches b
LEFT JOIN students s ON s.branch_id = b.id AND s.tenant_id = $tenantId
LEFT JOIN payments p ON p.tenant_id = $tenantId AND p.status = 'paid' ...
LEFT JOIN lessons l ON l.branch_id = b.id AND l.tenant_id = $tenantId ...
WHERE b.tenant_id = $tenantId AND b.status = 'active'
GROUP BY b.id, b.name
```
**Impact:** 19 queries → 1 query. 1,900 queries at 100 concurrent → 100.

### Code Fix 3 — Paginate the payments and invoices list endpoints

**Current** (`payments.ts:26`, `invoices.ts:55`): No `.limit()`. Returns all rows for the tenant. A tenant with 10,000 payment records transmits all 10,000 on every load.

**Fix:** Add cursor-based or offset pagination:
```typescript
paymentRoutes.get("/", zValidator("query", z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})), async (c) => {
  const { limit, offset } = c.req.valid("query");
  const rows = await db.select(...).from(payments)
    .where(eq(payments.tenantId, tenantId))
    .orderBy(desc(payments.createdAt))
    .limit(limit)
    .offset(offset);
  return c.json({ items: rows, limit, offset });
});
```
**Impact:** Response payload drops from potentially MBs to ~50KB per page. DB scan time drops proportionally.

### Code Fix 4 — Move session lookup to Redis (session caching)

Described in Infra Fix 3. The implementation point is `server/auth/session.ts:getSessionUser`. The change is:
1. On session hit from Redis: return cached user object without touching Postgres.
2. On cache miss: existing DB path, then `redis.set(token, JSON.stringify({ session, user }), { ex: 300 })`.
3. On `revokeSession`: also call `redis.del(token)`.

This eliminates the guaranteed 2 DB queries per authenticated request for all warm sessions.

### Code Fix 5 — Move outbound webhooks and registry calls off the request path

**Webhook dispatch** (`lib/webhookDispatch.ts:89`): Currently called synchronously within the mutation route (e.g., lead stage change fires webhook inline). A slow customer webhook server holds the Vercel function slot.

**Fix:** Push to a queue (Inngest, Upstash QStash, or a `webhook_delivery_queue` table polled by a cron). The mutation returns 200 immediately; the webhook delivery happens async.

**Registry proxy** (`lib/companyRegistry.ts`, 12-second timeout): Add a short-lived cache (5-minute TTL by IDNO in Redis or even in-process since the registry data is public). A search for "Vector" by 50 users simultaneously should not fire 50 upstream requests to contafirm.md.

### Code Fix 6 — Dedup session `lastActiveAt` update writes

`getSessionUser` fires a fire-and-forget `UPDATE sessions SET lastActiveAt = now()` on every request. At 1,000 RPS, this is 1,000 write queries per second to the `sessions` table — all on the same rows (active sessions). These create write contention on the sessions table.

**Fix:** Throttle to at most once per 60 seconds per session token using Redis (`redis.set(token + ':ping', 1, { ex: 60, nx: true })` — only update Postgres if the set returns `true`). This reduces session-table writes by 60x.

---

## 4. Realistic Capacity Estimate

### Current setup (no changes)

| Tier | Approximate concurrent users before degradation |
|---|---|
| Supabase Free + Vercel classic serverless | ~15–20 (pool exhaustion) |
| Supabase Pro + Vercel classic serverless | ~180–200 (pool exhaustion) |
| With paginated queries + batched attendance | ~200 (same ceiling — still pool-limited) |

The hard ceiling is the pgBouncer `max_client_conn` on the Supabase plan. No code optimization helps until Fix 1 (Fluid Compute) changes the connection-per-request math.

### After top 3 fixes (Fluid Compute + Supabase Pro tuning + session Redis cache)

- Vercel Fluid Compute: 1,000 concurrent requests handled by ~20–50 warm instances = 20–50 pgBouncer connections (not 1,000).
- Redis session cache: 80-90% of those 20–50 connections don't hit Postgres at all for auth (cache hit on warm sessions).
- Supabase Pro with `max_client_conn=1000`, `default_pool_size=25`, Small compute:
  - Effective concurrent users: **1,500–3,000** before DB CPU becomes the bottleneck.
  - Analytics routes (unfixed N+1s): still a degradation point; with 1,000 simultaneous analytics loads at 19 queries each, Postgres sees 19,000 queries/minute — manageable on Small compute but with p95 latency rising.

### After all 5 infrastructure fixes + top 3 code fixes

- Fluid Compute: 50 pooler connections for 1,000 concurrent users.
- Session Redis: auth overhead eliminated from DB path.
- Analytics single-query rewrite: 19,000 queries/minute → 1,000.
- Paginated payments/invoices: payload size and scan time reduced 100x.
- Missing indexes: seq-scans eliminated on hot columns.
- CDN caching on analytics: 1,000 DB hits/minute → 1/minute for shared tenant views.

**Effective capacity: 5,000–10,000 concurrent users** before needing read replicas or Supabase Large compute. The primary bottleneck at that scale shifts to Postgres CPU on complex multi-join analytics queries, addressable with materialized views or a dedicated analytics read replica.

---

## 5. Load-Testing Plan

### Tool: k6 (recommended over Artillery for Vercel serverless — handles concurrent VUs well)

### Test script outline

```javascript
// k6 test: vector-learn-1000-concurrent.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.BASE_URL || 'https://your-domain.vercel.app';

// Ramping stages: 0 → 100 → 500 → 1000 → 0 concurrent VUs
export const options = {
  stages: [
    { duration: '1m',  target: 100  },  // warm up
    { duration: '3m',  target: 100  },  // hold — establish baseline
    { duration: '2m',  target: 500  },  // ramp to 500
    { duration: '3m',  target: 500  },  // hold at 500
    { duration: '2m',  target: 1000 },  // ramp to 1000
    { duration: '5m',  target: 1000 },  // hold — peak load test
    { duration: '2m',  target: 0    },  // ramp down
  ],
  thresholds: {
    // SLOs — fail the test if these breach
    'http_req_duration{scenario:login}': ['p95<500'],
    'http_req_duration{scenario:dashboard}': ['p95<2000'],
    'http_req_duration{scenario:analytics}': ['p95<5000'],
    'http_req_failed': ['rate<0.01'],  // <1% error rate
    'checks': ['rate>0.99'],
  },
};

// Scenario: login → dashboard → analytics (realistic user journey)
export default function () {
  // 1. Login
  const loginRes = http.post(`${BASE}/api/auth/login`, JSON.stringify({
    email: `loadtest-${__VU}@tenant-demo.com`,
    password: 'LoadTest123!',
  }), { headers: { 'Content-Type': 'application/json' }, tags: { scenario: 'login' } });

  check(loginRes, {
    'login 200': (r) => r.status === 200,
    'login has user': (r) => JSON.parse(r.body).user !== undefined,
  });

  const jar = http.cookieJar();
  // 2. Dashboard (students list — paginated)
  const dashRes = http.get(`${BASE}/api/students?limit=50&offset=0`, {
    tags: { scenario: 'dashboard' },
    jar,
  });
  check(dashRes, { 'students 200': (r) => r.status === 200 });

  sleep(1);

  // 3. Heavy analytics route
  const analyticsRes = http.get(`${BASE}/api/analytics/branches`, {
    tags: { scenario: 'analytics' },
    jar,
  });
  check(analyticsRes, { 'analytics 200': (r) => r.status === 200 });

  sleep(2);

  // 4. Payments list (unpaginated — stress test)
  const paymentsRes = http.get(`${BASE}/api/payments`, {
    tags: { scenario: 'payments' },
    jar,
  });
  check(paymentsRes, { 'payments 200': (r) => r.status === 200 });

  sleep(Math.random() * 3 + 1);  // think time 1–4s
}
```

### Metrics to watch during the test

| Metric | Source | Target SLO | Alert threshold |
|---|---|---|---|
| p50 / p95 / p99 API latency | k6 `http_req_duration` | p95 < 2s | p95 > 3s |
| HTTP error rate | k6 `http_req_failed` | < 1% | > 1% |
| Supabase pgBouncer active connections | Supabase dashboard → Metrics → Connections | < 80% of `max_client_conn` | > 90% |
| Supabase Postgres CPU | Supabase dashboard → Metrics → CPU utilization | < 70% | > 85% |
| Vercel function invocations / concurrent | Vercel dashboard → Functions → Active connections | < 80% of plan quota | > 90% |
| Vercel function error rate | Vercel dashboard → Functions → Error rate | < 0.5% | > 1% |
| DB query p99 (per Supabase slow query log) | Supabase → Logs → Slow queries | < 500ms | > 1s |
| Redis hit rate (after Fix 3) | Upstash console | > 80% | < 60% |

### Test phases and what to look for

1. **Baseline (100 VUs, 3 minutes):** Establish p95 latency per route, zero errors expected.
2. **Ramp to 500:** Watch for pgBouncer connection count climbing in Supabase metrics. First 500 errors here indicate Fix 1 (Fluid Compute) is not yet active or Fix 2 (pool sizing) is too low.
3. **Hold at 1,000 VUs, 5 minutes:** p95 analytics latency is the key signal. If analytics breaches 5s at 1,000 VUs, Fix 2 (Code: analytics rewrite) is mandatory before go-live. If payments/invoices p95 > 2s, Fix 3 (Code: pagination) is blocking.
4. **Post-test:** Review Supabase "Slow Queries" log for any query exceeding 500ms. Any showing up here at scale are index candidates.

### Success criteria for 1,000-user readiness

- p95 API latency < 2s for authenticated list endpoints.
- p95 < 5s for analytics routes.
- Error rate < 1% across the full 5-minute hold at 1,000 VUs.
- Supabase CPU < 70% sustained during hold.
- Supabase pgBouncer active connections < 80% of `max_client_conn` during hold.

---

## 6. Summary Table

| Priority | Change | Where | Effort | 1000-user impact |
|---|---|---|---|---|
| 1 | Enable Vercel Fluid Compute | `vercel.json` + dashboard | 1 line | Eliminates pool exhaustion (1000 → 50 pooler connections) |
| 2 | Upgrade Supabase Pro + tune `max_client_conn=1000`, `default_pool_size=25` + Small compute | Supabase dashboard | Config only | Raises hard connection ceiling; adds DB CPU headroom |
| 3 | Redis session cache (Upstash) | `server/auth/session.ts` | 1–2 days | Removes 80-90% of auth DB queries; fixes stateful rate-limiters and undo store |
| 4 | Batch attendance upsert | `server/routes/lessons.ts:436` | 2 hours | 400 serial DB ops → 1 batch; critical for check-in at class start spike |
| 5 | Analytics branches single-query rewrite | `server/routes/analytics.ts:276` | 4 hours | 19 DB queries → 1 per analytics dashboard load |
| 6 | Paginate payments + invoices GET | `server/routes/payments.ts`, `invoices.ts` | 2 hours | Prevents unbounded result-set scans |
| 7 | CDN cache headers on analytics GETs | Hono middleware | 2 hours | 1000 hits/min → 1/min per tenant for stable analytics views |
| 8 | Add missing indexes (paidAt, dueDate, xpEvents, directMessages, sl_attendance) | Schema + migration | 2 hours | Eliminates seq-scans on hot analytics columns |
| 9 | Async webhook dispatch (queue) | `lib/webhookDispatch.ts` | 1 day | Removes external I/O from request path |
| 10 | Registry proxy cache (Redis, 5-min TTL by IDNO) | `lib/companyRegistry.ts` | 2 hours | Eliminates 50 upstream calls from 50 concurrent searches |
