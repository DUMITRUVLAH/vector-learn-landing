# Performance Audit — Vector Learn Landing
**Date:** 2026-06-01  
**Scope:** Frontend bundle, React rendering, backend/serverless, API efficiency, assets  
**Auditor:** Performance Engineer agent  

---

## Executive Summary

The app has no code splitting at all — every page is bundled into one JS chunk loaded on first visit, including `recharts`, heavy CRM pages (2 200 LOC `LeadsPage`), and dozens of app pages that a landing visitor never touches. The leads pipeline endpoint runs **4 sequential DB queries per request** with no pagination for kanban view. The `GET /api/leads/today` endpoint issues **5–6 sequential DB queries** with table-scans on `lead_interactions`. Session auth makes **2 DB round-trips** on every authenticated request. An in-memory undo store in serverless functions silently loses its state on every cold-start. Notifications poll every 30 s from every authenticated page.

`npm run build` was not runnable in this session (Bash permission not granted for build commands). Bundle size numbers below are estimated from import analysis; the project owner should run `npm run build` and inspect `dist/assets/` for gzip sizes to validate against the 100 KB/route budget.

---

## HIGH Impact Findings

---

### H1 — Zero code splitting: entire app in one JS chunk
**File:** `src/App.tsx:16–55` (all imports), `src/main.tsx`

All 30+ page components — including `LeadsPage` (2 208 LOC), `LeadCardPage` (1 710 LOC), `StudentsPage`, `AnalyticsPage`, `RevenueChartsPage` (imports recharts), and every audience/module/tool page — are **statically imported** at the top of `App.tsx`. There is no `React.lazy()` or `Suspense` anywhere in the codebase (`grep -r "React.lazy" src/` returned nothing).

A landing page visitor who never logs in downloads the entire CRM, all app logic, and recharts just to see the marketing homepage. Landing pages and app pages live in the same bundle.

**Estimated impact:** The app bundle likely exceeds 400–500 KB gzip. The project budget is 100 KB gzip per route. Every extra 100 KB adds ~1 s on simulated 3G (Lighthouse mobile), directly hitting the Lighthouse Performance ≥ 90 target.

**Fix:**
```tsx
// src/App.tsx — replace static imports with lazy
const LeadsPage = React.lazy(() => import("./pages/app/LeadsPage"));
const LeadCardPage = React.lazy(() => import("./pages/app/LeadCardPage"));
const RevenueChartsPage = React.lazy(() => import("./pages/app/RevenueChartsPage"));
// ... all other app/ and modules/ pages

// Wrap <Routes> with Suspense
<Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
  <Routes />
</Suspense>
```

At minimum, split into three async boundaries: (1) landing/marketing, (2) app pages, (3) module/audience detail pages. This should reduce the landing route to under 80 KB gzip.

---

### H2 — `recharts` imported in `RevenueChartsPage` which is eagerly loaded
**File:** `src/pages/app/RevenueChartsPage.tsx:10`

```tsx
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
```

`recharts` is ~90 KB gzip on its own (it bundles D3 internals). `RevenueChartsPage` is imported statically in `App.tsx:46`. This single import inflates the initial bundle by ~90 KB for a page only finance managers ever visit.

**Fix:** Lazy-load `RevenueChartsPage` (covered by H1 fix). Additionally, evaluate whether the custom SVG chart components already in the codebase (`src/components/modules/finante/RevenueChart.tsx`, `src/components/modules/rapoarte/LineChart.tsx`, `src/components/modules/rapoarte/BarChart.tsx`) could replace recharts for this page — they are zero-dependency SVG renders already in the bundle.

---

### H3 — `GET /api/leads/pipeline` runs 3 sequential DB queries with no pagination
**File:** `server/routes/leads.ts:382–458`

The kanban pipeline endpoint fetches **all leads for the tenant** (no LIMIT), then fetches all open tasks, then fetches tenant SLA settings — three sequential round-trips:

```ts
// leads.ts:384–388 — unbounded SELECT of all leads
const items = await db.select().from(leads)
  .where(eq(leads.tenantId, tenantId))
  .orderBy(desc(leads.createdAt));   // no LIMIT

// leads.ts:390–396 — all open tasks, no IN filter
const openTasks = await db.select().from(leadTasks)
  .where(and(eq(leadTasks.tenantId, tenantId), eq(leadTasks.status, "open")))
  .orderBy(asc(leadTasks.dueAt));    // fetches tasks for ALL leads, not just the page

// leads.ts:406–409 — separate tenant lookup
const tenant = await db.query.tenants.findFirst(...);
```

At 500 leads with 50 tasks each, the tasks query returns 25 000 rows across a network hop. On Supabase's transaction pooler (`:6543`) each query opens a new connection; 3 serial hops add ~50–150 ms of pooler overhead before any data is returned.

**Fix:**
1. Add server-side pagination to the pipeline endpoint (the list view already has it — apply the same pattern).
2. Combine the tenant SLA fetch with the main query using `JOIN` or run it in `Promise.all` alongside the leads query.
3. Filter tasks to only the fetched lead IDs: `inArray(leadTasks.leadId, items.map(l => l.id))` — already done in the list view path (`leads.ts:333–346`) but missing in the pipeline path.

---

### H4 — `GET /api/leads/today` issues 5 sequential DB queries with full table-scan on `lead_interactions`
**File:** `server/routes/leads-today.ts:58–275`

The endpoint runs these queries in sequence (not parallel):

1. `dueTasks` — OK, uses join
2. `recentLeads` — OK, bounded
3. `outboundInteractions` — **no `inArray(leadId)` filter, scans ALL outbound interactions for the tenant** (`leads-today.ts:100–108`, comment says "Only check for the recent leads" but the WHERE clause does not include `inArray(leadInteractions.leadId, recentLeadIds)`)
4. `contactedTrialLeads` — OK
5. `interactions` (for follow-up) — scans ALL outbound interactions for the tenant, no leadId filter (`leads-today.ts:145–157`)
6. `tenant` SLA settings
7. `activeLeads` + `recentInteractions` — another unbounded interactions scan (`leads-today.ts:265–275`)

At scale (1 000+ interactions), queries 3, 5, and 7 each do a full table-scan filtered only by `tenantId` and `direction`. The `lead_interactions` table has an index on `(lead_id, occurred_at)` but NOT on `(tenant_id, direction)` — these queries cannot use the existing indexes effectively.

**Fix:**
1. Add a missing `inArray(leadInteractions.leadId, recentLeadIds)` to query 3 (`leads-today.ts:103`).
2. Add a missing `inArray(leadInteractions.leadId, contactedTrialIds)` to query 5 (`leads-today.ts:151`).
3. Run queries 1–4 in `Promise.all` — they are independent.
4. Add a composite index: `index("li_direction_idx").on(t.tenantId, t.direction, t.occurredAt)` in `server/db/schema/leads.ts`.

---

### H5 — `requireAuth` issues 2 DB round-trips on every authenticated API request
**File:** `server/auth/session.ts:20–32`

```ts
export async function getSessionUser(token: string) {
  const session = await db.query.sessions.findFirst(
    { where: eq(sessions.token, token) }   // DB round-trip 1
  );
  ...
  const user = await db.query.users.findFirst(
    { where: eq(users.id, session.userId) }  // DB round-trip 2
  );
```

Every API endpoint first runs `requireAuth` which fires two sequential DB queries. On Vercel serverless with Supabase's transaction pooler, each query takes ~10–30 ms of overhead. For a page like `LeadCardPage` that fires 8 parallel API calls on mount (`fetchAll` at `LeadCardPage.tsx:161`), all 8 hit `requireAuth` concurrently, each doing 2 DB queries — that's 16 DB queries just for auth on a single page load.

**Fix options (cheapest first):**
1. **Join sessions and users in a single query** — eliminates one round-trip:
   ```ts
   const result = await db.select({ session: sessions, user: users })
     .from(sessions)
     .innerJoin(users, eq(users.id, sessions.userId))
     .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
     .limit(1);
   ```
2. **Add an in-process cache** (module-level `Map<token, {user, expiresAt}>`) with a 60-second TTL. Serverless instances are short-lived, so memory pressure is bounded, and the same instance handles many requests in the same warm window.

---

## MEDIUM Impact Findings

---

### M1 — `getFilteredLeads` is a plain function (not memoized) called in the Kanban render loop
**File:** `src/pages/app/LeadsPage.tsx:286–329`

```tsx
const getFilteredLeads = (stageKey: string): Lead[] => {
  const all = grouped[stageKey] ?? [];
  // .filter() + .sort() with new Date() comparisons on every call
  return [...filtered].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
};
```

This function is called once per stage column on every render of `LeadsPage` (`LeadsPage.tsx:764`). With 6–8 pipeline stages and 50+ leads per stage, each render re-runs filter+sort on hundreds of leads. The sort allocates new `Date` objects on every comparison (14 `new Date()` instantiations counted in `LeadsPage.tsx`).

The function is declared inside the component body but NOT wrapped in `useCallback` or `useMemo`. Any state change (hover stage, drag state, toast, overflow menu open) triggers a full re-filter+resort of the entire kanban.

**Fix:**
```tsx
const filteredByStage = useMemo(() => {
  const result: Record<string, Lead[]> = {};
  for (const stage of stages) {
    const all = grouped[stage.key] ?? [];
    const filtered = all.filter(/* same logic */);
    result[stage.key] = filtered.sort(/* same sort */);
  }
  return result;
}, [grouped, filterSource, filterAssigned, searchQuery, filterNoTask, filterOverdue, kanbanSort]);
```

Pre-compute all columns at once when deps change; the render loop reads `filteredByStage[stage.key]` directly.

---

### M2 — `KanbanCardAssigneeName` calls `useTeamMembers()` inside every KanbanCard
**File:** `src/pages/app/LeadsPage.tsx:1079–1085`

```tsx
function KanbanCardAssigneeName({ assignedTo }: { assignedTo: string }) {
  const name = useAssigneeName(assignedTo); // calls useTeamMembers() internally
  return <p ...>{name}</p>;
}
```

Every `KanbanCardAssigneeName` instance calls `useTeamMembers()` which returns the same module-level cached array — but each hook invocation still runs the `members.find()` linear scan on re-render. With 100 kanban cards all having an assignee, `members.find()` runs 100 times per render pass.

Additionally, `KanbanCard` is not wrapped in `React.memo`, so any parent state change (e.g. `hoverStage`, `draggedId`) re-renders all cards.

**Fix:**
1. Pass the resolved name as a prop from the parent where the `useMemo` from M1 runs (compute `assignee → name` map once).
2. Wrap `KanbanCard` in `React.memo` with a custom comparator that ignores unrelated parent state.

---

### M3 — `new Intl.NumberFormat(...)` instantiated inline on every render for every card
**File:** `src/pages/app/LeadsPage.tsx:986,991,1174,335`

```tsx
// In KanbanCard render — runs for every card on every render
{new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(...)}
```

`Intl.NumberFormat` construction is expensive (~0.1 ms each on V8). With 100 cards × 2 potential renders per drag event this is measurable jank. The same pattern appears in `LeadListView` (`line:1174`), `TodayDashboardPage`, `KpiDashboardPage`, and several other pages.

**Fix:** Hoist a single shared formatter to module scope:
```tsx
const EUR_FMT = new Intl.NumberFormat("ro-RO", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
```
Apply this pattern across all files that instantiate `Intl.NumberFormat` inline (currently 8+ files).

---

### M4 — `LeadCardPage` fires 8 parallel API calls on every mount
**File:** `src/pages/app/LeadCardPage.tsx:161–185`

```tsx
const [leadRes, stagesRes, interRes, tasksRes, attRes, contactsRes, tagsRes, fieldValuesRes] =
  await Promise.all([getLead, fetchPipelineStages, listInteractions, listTasks,
                     listAttachments, listContacts, listTags, listFieldValues]);
```

`fetchPipelineStages` is called here and also called independently by `LeadsPage`. There is no cross-page cache for pipeline stages or lead interactions — they are always refetched on mount. Additionally, `listAttachments` and `listContacts` are fetched eagerly even though they are only visible when the user clicks the "Files" and "Contacts" tabs.

**Fix:**
1. Lazy-fetch `listAttachments`, `listContacts`, `listTags`, and `listFieldValues` on tab activation (only when `activeTab === "files"` etc.) using a local `hasFetched` ref per tab.
2. Cache `fetchPipelineStages` at module level (same pattern as `useTeamMembers`) — pipeline stages rarely change.

---

### M5 — `GET /api/leads` list view fetches ALL tasks for the tenant, not just the page
**File:** `server/routes/leads.ts:331–347`

```ts
const openTasks = await db.select().from(leadTasks)
  .where(and(
    eq(leadTasks.tenantId, tenantId),
    eq(leadTasks.status, "open")
  ))
  .orderBy(asc(leadTasks.dueAt));
// Then in JS: filter by leadIds that are on the current page
```

This fetches all open tasks for the entire tenant, transfers them to the Node process, then filters in JS with `leadIds.includes(task.leadId)`. At 5 000 open tasks across 10 tenants (realistic for a growing center), each list-view page request transfers 5 000 task rows over the network.

**Fix:** Add `inArray(leadTasks.leadId, leadIds)` to the WHERE clause before the query executes (the variable `leadIds` is available at `leads.ts:332`). This is already the right pattern but the filter is applied in application code instead of SQL.

---

### M6 — `NotificationBell` polls `/api/notifications` every 30 s from every app page
**File:** `src/components/app/NotificationBell.tsx:13,75–78`

```tsx
const POLL_INTERVAL_MS = 30_000;
useEffect(() => {
  const timer = setInterval(() => void load(true), POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}, [load]);
```

`NotificationBell` is mounted inside `AppShell`, which is used by every app page. Every navigation keeps the timer running. This means any authenticated session fires a `/api/notifications` request every 30 s. At 100 concurrent users, that is ~200 requests/minute just for notification polling — plus `AppShell` also fires `GET /api/leads/today` on every mount for the nav badge count (`AppShell.tsx:55–61`).

The today-count fetch has a 5-minute sessionStorage cache but the notifications poll has no cache — it always hits the server.

**Fix:**
1. Increase the interval to 60 s (notifications are not real-time critical).
2. Use `document.visibilityState` to pause polling when the tab is hidden.
3. Add a client-side dedup: skip the poll if the tab became visible less than 30 s ago.

---

### M7 — `undoStore` is an in-memory `Map` inside a serverless function — state is lost on every cold start
**File:** `server/routes/leads.ts:44–55`

```ts
const undoStore = new Map<string, UndoEntry>();
```

Vercel serverless functions are stateless — the module-level `undoStore` lives for the lifetime of the warm lambda instance. A cold start (which happens on every new request within a fresh invocation window, especially on Vercel's serverless hobby plan) creates a new empty Map. Any undo token issued by one instance is invisible to the next.

The 35-second TTL means undo is likely to fail for any user who triggers a delete and then waits even a few seconds if the instance recycles.

**Fix:** Move the undo state to Postgres — insert a row into a `lead_undo_log` table on delete, read it back on `/undo/:token`, delete on use or expiry. This is a small schema addition but makes undo actually reliable.

---

### M8 — Dual `fetchPipeline` + `fetchPipelineStages` calls fire on every `LeadsPage` mount
**File:** `src/pages/app/LeadsPage.tsx:262–278`

```tsx
const fetchAll = useCallback(async () => {
  const [pipelineRes, stagesRes, forecastRes] = await Promise.all([
    fetchPipeline(),         // GET /api/leads/pipeline
    fetchPipelineStages(),   // GET /api/pipeline-stages — fetches the same stage list
    getForecast().catch(() => null),
  ]);
```

`fetchPipeline()` already returns the full grouped leads. `fetchPipelineStages()` is a separate call for the stage configuration (labels, colors, `isLost` flag). These fire together on mount and again after every drag, add, or import operation. The stage list changes extremely rarely (user-configured; maybe once per week). It could be cached at module level for the session.

---

## LOW Impact Findings

---

### L1 — Google Fonts loaded with render-blocking `<link rel="stylesheet">`
**File:** `index.html:18–21`

```html
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@100..900&display=swap"
      rel="stylesheet" />
```

This is a render-blocking stylesheet from an external origin. It triggers a DNS lookup + TLS handshake + HTTP request to `fonts.googleapis.com` before the browser can render any text. The `preconnect` hints are present and correct, but the stylesheet itself still blocks first paint by 100–300 ms on mobile connections.

**Fix:** Add `media="print" onload="this.media='all'"` for non-render-blocking async load, or self-host the Onest font via the Vite build pipeline with `@fontsource/onest`:
```html
<link rel="preload" href="https://fonts.gstatic.com/..." as="font" type="font/woff2" crossorigin />
```

---

### L2 — `useSession` re-fetches `/api/auth/me` on every component mount with no cache
**File:** `src/hooks/useSession.ts:36–51`

`useSession` is a hook (not a context/singleton), so every component that calls it independently fires a fresh `GET /api/auth/me` on its first render. `AppShell`, `LeadsPage`, `LeadCardPage`, and other pages all call `useSession()` directly. On `LeadCardPage` both `AppShell` (via layout) and `LeadCardPage` call `useSession()` — this is two concurrent `/api/auth/me` requests on a single page.

**Fix:** Wrap `useSession` in a React Context at the `App` level and share the single state. The hook already has all the right logic — just lift the state into a provider.

---

### L3 — `AssigneeFilterSelect` calls `useTeamMembers()` independently from `KanbanCardAssigneeName`
**File:** `src/pages/app/LeadsPage.tsx:1095–1111`

`AssigneeFilterSelect` (the filter bar dropdown) and `KanbanCardAssigneeName` (each kanban card) both call `useTeamMembers()`. While the data is deduplicated via the module-level cache, each hook invocation still re-subscribes to state updates and holds its own copy of `members`. With 100 kanban cards having an assignee, there are 101 independent `useState` subscriptions to the same team members list.

**Fix:** Pass `members` as a prop from `LeadsPage` (which already calls `useTeamMembers()` via `const { members: teamMembers } = useTeamMembers()` at `LeadsPage.tsx:80`).

---

### L4 — `notifications.ts` issues 2 queries when 1 would suffice
**File:** `server/routes/notifications.ts:19–48`

```ts
const items = await db.select().from(notifications)...limit(20);      // query 1
const unreadResult = await db.select({ cnt }).from(notifications)...;  // query 2 — COUNT
```

Both queries hit the same table with the same `tenantId + userId` filter. The count can be derived from the already-fetched 20 items (for the badge display) or included as a window function in a single query.

**Fix:** Replace the COUNT query with a `sql<number>\`count(*) OVER()\`` window function in the single SELECT, or compute `unreadCount = items.filter(n => !n.isRead).length` if the 20-item list is representative.

---

### L5 — `students.ts` list endpoint issues a separate COUNT query after the data query
**File:** `server/routes/students.ts:74–77`

```ts
const rows = await db.select().from(students)...limit(limit).offset(offset);
const [{ total }] = await db.select({ total: sql`count(*)` }).from(students).where(where);
```

Both use the same `where` clause. This pattern (data query + separate COUNT) appears in at least 3 routes (`students.ts`, `leads.ts` list view). Replace with a single query using `COUNT(*) OVER()` window function or combine into a CTE.

---

### L6 — `leads-today.ts` fetches tenant SLA settings sequentially at the end of 4 other queries
**File:** `server/routes/leads-today.ts:232–239`

```ts
// After dueTasks, recentLeads, outboundInteractions, contactedTrialLeads ...
const tenant = await db.query.tenants.findFirst({ ... }); // sequential, not parallel
```

The tenant SLA fetch could run in `Promise.all` alongside the lead queries since it has no dependency on them.

---

### L7 — `LeadCardPage` has no `React.memo` on any sub-components; 18 `useState` hooks trigger full re-renders
**File:** `src/pages/app/LeadCardPage.tsx:75–131`

The page has 18 `useState` hooks. Any state change (e.g. `showActionsMenu`, `toast`, `undoToken`) re-renders the entire 1 710-LOC component tree. Sub-components like the activity log list, task list, and attachment list are inlined without memoization.

**Fix:** Extract the tab content areas into named sub-components (`ActivityTab`, `TasksTab`, `FilesTab`) and wrap them in `React.memo`. Lift stable data as props passed down once.

---

### L8 — `Object.values(grouped).flat()` called 3 times inline in `LeadsPage` render
**File:** `src/pages/app/LeadsPage.tsx:339,374,724`

```tsx
// In handleDrop (lines 339, 374 — called on drop, OK):
const allLeads = Object.values(grouped).flat();

// In render path (line 724 — called every render):
leads={Object.values(grouped).flat().filter((lead) => { ... })}
```

Line 724 is inside the render path of the mobile lead list. It flattens and filters all grouped leads on every render.

**Fix:** Compute `const allLeads = useMemo(() => Object.values(grouped).flat(), [grouped])` once; use it at all three call sites.

---

## Index Gaps (DB side — flagged per audit scope)

These are obvious query-level issues surfaced during the route analysis. The DB audit is separate but these are direct performance blockers:

1. **`lead_interactions` has no index on `(tenant_id, direction)`** — queries in `leads-today.ts` (3 separate queries) and `leads.ts` pipeline scan the full interactions table filtered only by `tenantId`. Add: `index("li_dir_idx").on(t.tenantId, t.direction, t.occurredAt)` in `server/db/schema/leads.ts`.

2. **`lead_tasks` has no index on `(tenant_id, status, due_at)`** — the `GET /api/leads/pipeline` and `GET /api/leads/today` both query `WHERE tenant_id = X AND status = 'open'`. The existing `statusIdx` on `(tenant_id, status)` (`tasks.ts:33`) is correct; verify it covers the `ORDER BY due_at` sort. A covering index `(tenant_id, status, due_at)` would eliminate the sort.

3. **`leads` has no index on `(tenant_id, score)`** — `GET /api/leads/today` NBA section orders by `score DESC` (`leads-today.ts:215`). Without an index on score, this requires a full scan + sort.

---

## Summary Table

| # | Area | File:Line | Impact | Effort |
|---|------|-----------|--------|--------|
| H1 | No code splitting — entire app in one chunk | `src/App.tsx:16–55` | Critical — bundle budget violated | Medium |
| H2 | `recharts` (~90 KB gzip) loaded on landing page | `src/pages/app/RevenueChartsPage.tsx:10` | High — fixed by H1 | Low (lazy) |
| H3 | Pipeline endpoint: 3 sequential queries, no pagination | `server/routes/leads.ts:382–458` | High — cold-start + latency | Medium |
| H4 | Today endpoint: 5–6 sequential queries, full table-scan on interactions | `server/routes/leads-today.ts:100–275` | High — grows with data | Medium |
| H5 | `requireAuth`: 2 DB round-trips per request | `server/auth/session.ts:20–32` | High — multiplied by concurrent requests | Low |
| M1 | `getFilteredLeads` not memoized, runs on every render | `src/pages/app/LeadsPage.tsx:286` | Medium — kanban jank | Low |
| M2 | `KanbanCard` not memoized; `useTeamMembers()` per card | `src/pages/app/LeadsPage.tsx:1079` | Medium | Low |
| M3 | `new Intl.NumberFormat()` inline per card per render | `src/pages/app/LeadsPage.tsx:986,991` | Medium | Trivial |
| M4 | `LeadCardPage` fetches 8 APIs on mount; tabs eager | `src/pages/app/LeadCardPage.tsx:161` | Medium — TTFB on card page | Medium |
| M5 | Tasks fetched for entire tenant, filtered in JS | `server/routes/leads.ts:331` | Medium — scales badly | Trivial |
| M6 | Notifications poll every 30 s, no visibility check | `src/components/app/NotificationBell.tsx:75` | Medium — unnecessary server load | Low |
| M7 | `undoStore` is in-memory Map — lost on cold start | `server/routes/leads.ts:44` | Medium — broken UX in serverless | Medium |
| M8 | `fetchPipelineStages` not cached across navigations | `src/pages/app/LeadsPage.tsx:264` | Low-Medium | Low |
| L1 | Google Fonts render-blocking stylesheet | `index.html:18` | Low — ~150 ms first paint | Low |
| L2 | `useSession` not shared via Context — duplicate fetches | `src/hooks/useSession.ts` | Low | Medium |
| L3 | `useTeamMembers()` called N+1 times for N kanban cards | `src/pages/app/LeadsPage.tsx:1095` | Low (cache hides cost) | Low |
| L4 | Notifications: 2 queries when 1 would do | `server/routes/notifications.ts:19` | Low | Trivial |
| L5 | Students list: separate COUNT query | `server/routes/students.ts:74` | Low | Trivial |
| L6 | Today: tenant SLA fetch is sequential | `server/routes/leads-today.ts:232` | Low | Trivial |
| L7 | `LeadCardPage`: no memoization on subtrees | `src/pages/app/LeadCardPage.tsx` | Low | Medium |
| L8 | `Object.values(grouped).flat()` in render path | `src/pages/app/LeadsPage.tsx:724` | Low | Trivial |

---

## Recommended Fix Order

1. **H1** (code splitting) — highest impact, enables all Lighthouse targets. Do this first.
2. **H5** (requireAuth join) — single-query session lookup, trivial change, large multiplier.
3. **H4** (today endpoint queries) — add `inArray` filters + `Promise.all`.
4. **H3** (pipeline pagination + task inArray) — prevents data-growth regression.
5. **M1 + M2 + M3** (kanban memoization) — do together in one pass.
6. **M5 + L4 + L5** (SQL inArray / count-in-query) — trivial, batch in one commit.
7. **M7** (undo store → DB) — correctness + performance.
8. **L1** (font loading) — non-blocking font swap.
