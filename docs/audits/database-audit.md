# Vector Learn — Database Performance Audit

**Date:** 2026-06-02  
**Scope:** Drizzle ORM schema (~89 table files), server/routes/, migrations 0000–0108  
**Prod DB:** Supabase Postgres | Local/tests: PGlite  
**Auditor:** database-optimizer agent

---

## 1. Schema Drift — Missing `index.ts` Exports

**Result: CLEAN.** All 88 non-index schema files are exported from `server/db/schema/index.ts`. No missing exports found.

---

## 1b. Schema Drift — Code vs Migrations (the kind that 500s a fresh deploy) — **FOUND & FIXED 2026-06-02**

> The `index.ts`-export check above is necessary but **not sufficient**. A schema can be
> exported correctly and still have columns/tables that **no migration ever creates**. On
> the existing prod DB this is masked by `sync-schema.ts` (which `ADD COLUMN`s at deploy) and
> by columns added manually over time — but a **fresh** DB (local PGlite, CI, a brand-new prod
> project) has only what the migrations build. `src/__tests__/schema-drift.test.ts` is the gate
> for this, and it was **RED**:

Code declared, but **no migration created**:
- **`webhook_events`** — entire table missing (CRM-104 idempotency log; `server/db/schema/webhooks.ts`). Schema + `webhookProviderEnum` existed, but there was never a `CREATE TABLE`.
- **`leads`** — `full_name_normalized`, `leadgen_id`, `meta_form_id`, `meta_ad_id`, `user_agent_at_consent`, `merged_into_id` (CRM-101/102/104), plus the `leads_name_idx` / `leads_leadgen_idx` indexes that reference them.
- **`homework_submissions`** — `notes`, `created_at`.

**Impact:** `npm run db:seed` failed (`column "full_name_normalized" of relation "leads" does not exist`), every fresh-DB test that touches these tables failed, and any route doing `db.query.webhookEvents` 500s on a fresh DB.

**Fix applied:** [`drizzle/0109_schema_drift_backfill.sql`](../../drizzle/0109_schema_drift_backfill.sql) — idempotent (`IF NOT EXISTS` / `duplicate_object` guards), so it is also safe to apply to the live prod DB where `sync-schema.ts` may have already added some of these columns. `schema-drift.test.ts` is now green.

**Residual (P1):** the only thing standing between code and a 500 was a test nobody runs on a red suite. Wire `schema-drift.test.ts` into the deploy gate (it already exists), and treat a missing **table** (not just column) as a hard build failure — `sync-schema.ts` only adds columns, never tables.

---

## 1c. Migration Integrity — multi-statement files break PGlite / fresh DB — **FOUND & FIXED 2026-06-02**

`npm run db:reset` (the fresh-DB path used by local dev, tests, and the migration gate) was
**fully broken**: it died on the first hand-written migration with
`cannot insert multiple commands into a prepared statement` (PG error 42601).

**Cause:** the Drizzle migrator splits each `.sql` on `--> statement-breakpoint` and sends each
chunk as **one** prepared statement. 23 hand-written migrations packed several DDL statements into
one file with **no breakpoints**, so PGlite (and the Postgres extended/simple protocol) rejected
the multi-command string. Prod (postgres-js) happened to tolerate it, which is exactly why this
only ever broke local/PGlite/CI and went unnoticed.

**Files fixed (23):** `0029, 0030, 0036, 0037, 0039, 0048–0051, 0059, 0060, 0063, 0064, 0083–0087, 0089, 0091, 0093–0095`. Each top-level statement now has `--> statement-breakpoint`, with a dollar-quote-aware split (a `;` inside a `DO $$ … $$;` block is **not** a boundary). `db:reset && db:seed` now succeed.

**Residual (P2):** add a CI check that every multi-statement migration `.sql` has breakpoints (a 10-line scan would have caught all 23), since `drizzle-kit generate` is broken on this repo and migrations are hand-written ([db-generate workaround](../../CLAUDE.md)).

---

## 2. DB Portability — Raw `.execute().rows` Bugs

### HIGH: `server/index.ts:71` — Bare `.rows` on raw execute result

```ts
const tableRow = tablesResult.rows[0] as { table_count: number } | undefined;
```

`db.execute(sql\`...\`)` returns an array directly on postgres-js (prod Supabase) and `{ rows: [] }` on PGlite (local/tests). This line crashes on prod Supabase because the result IS the array — `tablesResult.rows` is `undefined`. The duplicate file `server/app.ts:207` already has the correct `Array.isArray()` guard; `server/index.ts:71` was never updated.

**Fix:** Apply the same guard used in `app.ts`:
```ts
const tableRows = (Array.isArray(tablesResult) ? tablesResult : (tablesResult as any).rows) as
  Array<{ table_count: number }> | undefined;
const tableRow = tableRows?.[0];
```

### LOW: `server/routes/portal.ts:33`, `enroll.ts:26`, `portalNotifs.ts:36` — `r.rows ?? []`

All three use a private `normalizeRows<T>` helper that checks `Array.isArray(result)` first and falls back to `result.rows`. The `r.rows ?? []` inside that function is unreachable from a non-guarded path. These are safe — the pattern is correct. No fix required.

---

## 3. Missing Indexes — High Impact

### HIGH-1: `payments` — no index on `paidAt`

**Tables affected:** `payments`  
**Schema file:** `server/db/schema/payments.ts`

The payments table has three indexes: `payments_tenant_idx`, `payments_student_idx`, `payments_status_idx`. It has **no index on `paidAt`**.

`paidAt` is filtered with range predicates (`gte`, `lt`) in two hot paths:
- `server/routes/analytics.ts:317-329` — MRR per branch (runs for every branch in a `Promise.all`)
- `server/routes/branchReports.ts:97-112` — revenue per branch with `gte(payments.paidAt, fromDate)` + `lt(payments.paidAt, toDate)`

Without an index, both queries do a full `payments` table scan filtered by `tenantId`, then a range scan on `paidAt` in memory. At 10k+ payment rows this becomes the dominant cost on every branch analytics load.

**Fix:**
```ts
paidAtIdx: index("payments_paid_at_idx").on(t.tenantId, t.status, t.paidAt),
```
The composite `(tenantId, status, paidAt)` satisfies both queries (both filter `status = 'paid'` and a `paidAt` range).

---

### HIGH-2: `invoices` — no index on `dueDate`

**Schema file:** `server/db/schema/invoices.ts`

`invoices` has indexes on `tenantId`, `studentId`, `status`, and `number` but **not on `dueDate`**.

`dueDate` is queried with range predicates in:
- `server/routes/reminders.ts:78` — `lt(invoices.dueDate, threshold)` — the overdue-reminder sweep runs on a schedule and scans all invoices
- `server/routes/mobile.ts:448` — `orderBy(asc(invoices.dueDate))` — parent portal invoice list
- `server/routes/paymentPlans.ts:173` — `orderBy(invoices.dueDate)` — installment plan view

Without a `dueDate` index, the scheduled reminder sweep does a full tenant table scan. As invoice volume grows (multi-year tenant), this scales linearly.

**Fix:**
```ts
dueDateIdx: index("invoices_due_date_idx").on(t.tenantId, t.dueDate),
```

---

### HIGH-3: `gamification` — `xpEvents`, `studentStreaks`, `badges` tables have NO indexes at all

**Schema file:** `server/db/schema/gamification.ts`

The gamification module defines three tables using the minimal `pgTable()` signature with no second argument — meaning no indexes whatsoever. There are no FK constraints, no `tenantId` index, no `studentId` index.

Queried in:
- `server/routes/mobile.ts:766-773` — N+1 leaderboard: one `SUM(xpEvents.amount)` query per opt-in student, full scan of `xp_events` per student
- `server/routes/mobile.ts:711-715` — `studentStreaks` looked up by `tenantId + studentId` — sequential scan
- `server/routes/mobile.ts:715` and `badges.ts:178` — leaderboard badge counts

**Fix (schema/gamification.ts):**
```ts
export const xpEvents = pgTable("xp_events", { ... }, (t) => ({
  tenantStudentIdx: index("xp_events_tenant_student_idx").on(t.tenantId, t.studentId),
  typeIdx: index("xp_events_type_idx").on(t.tenantId, t.type),
}));

export const studentStreaks = pgTable("student_streaks", { ... }, (t) => ({
  // uniqueIndex already covers lookup
}));

export const badges = pgTable("badges", { ... }, (t) => ({
  tenantStudentIdx: index("badges_tenant_student_idx").on(t.tenantId, t.studentId),
}));
```

---

### HIGH-4: `parentStudentLinks` — no indexes on `parentUserId` or `studentId`

**Schema file:** `server/db/schema/parentLinks.ts`

`parent_student_links` uses the bare two-arg `pgTable()` form with no indexes defined. The table is queried in two hot paths in `server/routes/mobile.ts`:
- Line 407-412: `WHERE tenantId = X AND parentUserId = Y` — sequential scan
- Line 475-480: same pattern (parent's child list)
- Line 627-631: existence check

Every parent app load does at least two sequential scans of this table.

**Fix:**
```ts
export const parentStudentLinks = pgTable("parent_student_links", { ... }, (t) => ({
  tenantParentIdx: index("psl_tenant_parent_idx").on(t.tenantId, t.parentUserId),
  tenantStudentIdx: index("psl_tenant_student_idx").on(t.tenantId, t.studentId),
}));
```

---

### HIGH-5: `directMessages` — no indexes on `fromUserId`, `toUserId`, `sentAt`

**Schema file:** `server/db/schema/directMessages.ts`

`direct_messages` has no indexes. The message thread query in `server/routes/mobile.ts:531-542` filters by `tenantId` and then by two OR conditions on `(fromUserId, toUserId)`, then orders by `sentAt`. Without indexes this is a full table scan + sort on every message thread load.

**Fix:**
```ts
export const directMessages = pgTable("direct_messages", { ... }, (t) => ({
  tenantIdx: index("dm_tenant_idx").on(t.tenantId),
  threadIdx: index("dm_thread_idx").on(t.tenantId, t.fromUserId, t.toUserId),
  sentAtIdx: index("dm_sent_at_idx").on(t.tenantId, t.sentAt),
}));
```

---

## 4. Missing Indexes — Medium Impact

### MEDIUM-1: `leads` — no index on `branchId`

**Schema file:** `server/db/schema/leads.ts:83`

```ts
branchId: uuid("branch_id"),  // plain uuid, no FK, no index
```

`leads.branchId` has neither a FK constraint nor an index. When branch analytics filter leads by branch, this results in a full tenant leads scan. Compound with `stageIdx` or a standalone branch index.

**Fix:**
```ts
branchIdx: index("leads_branch_idx").on(t.tenantId, t.branchId),
```

---

### MEDIUM-2: `leads` — no index on `courseId`

**Schema file:** `server/db/schema/leads.ts:81`

`leads.courseId` has a FK but no index. Course-level conversion analytics (future INTEG-101 analytics) will do full tenant-scoped scans to count leads by course.

**Fix:**
```ts
courseIdx: index("leads_course_idx").on(t.tenantId, t.courseId),
```

---

### MEDIUM-3: `incidentReports` — `statusIdx` is missing `tenantId` prefix

**Schema file:** `server/db/schema/kinderIncidents.ts:80`

```ts
statusIdx: index("incident_reports_status_idx").on(t.status),
```

This creates a global index on `status` with no tenant prefix. For a multi-tenant table with millions of rows, this index is only useful for aggregates across all tenants (not valid access pattern). The actual query pattern is always `tenantId = X AND status = Y`.

**Fix:**
```ts
statusIdx: index("incident_reports_status_idx").on(t.tenantId, t.status),
```

---

### MEDIUM-4: `immunizationRecords` — `dueDateIdx` missing `tenantId`

**Schema file:** `server/db/schema/kinderMedical.ts:79`

```ts
dueDateIdx: index("immunization_records_due_date_idx").on(t.nextDueDate),
```

Same pattern as above — global index without tenant prefix. The alert query for upcoming vaccinations will always be scoped by `tenantId`.

**Fix:**
```ts
dueDateIdx: index("immunization_records_due_date_idx").on(t.tenantId, t.nextDueDate),
```

---

### MEDIUM-5: `sellerProfiles` — one-per-tenant table but only `tenantIdx`, no unique constraint

**Schema file:** `server/db/schema/sellerProfiles.ts`

The comments say "one row per tenant" but there is only a non-unique `index("seller_profiles_tenant_idx")`. A duplicate insert would silently create two rows and both would be returned on lookups. The route likely takes `[0]` but this is an implicit assumption.

**Fix:** Change to `uniqueIndex` on `tenantId`:
```ts
tenantUniq: uniqueIndex("seller_profiles_tenant_uniq").on(t.tenantId),
```

---

### MEDIUM-6: `paymentAccountItems` — no `tenantId` column, orphan FK only

**Schema file:** `server/db/schema/paymentAccountItems.ts`

The table references `paymentAccounts.id` (which carries `tenantId`) but `paymentAccountItems` has no `tenantId` of its own. This means:
- Cannot enforce tenant isolation at the DB layer without joining to `paymentAccounts`
- Row-level security policies cannot be applied directly
- Audit queries require a join

This is a design choice (denormalization avoided), but worth documenting. At minimum, add tenant isolation by always joining `paymentAccounts` in queries, which the current route does.

---

## 5. N+1 / Inefficient Access Patterns

### HIGH: `analytics.ts:300-353` — N+1 per branch (3 queries × N branches)

```ts
const result = await Promise.all(
  branchList.map(async (branch) => {
    // Query 1: active student count for this branch
    // Query 2: MRR (payments JOIN students) for this branch  
    // Query 3: lesson count for this branch
  })
);
```

For a tenant with 6 branches (Andreea's academy), this fires **18 DB roundtrips** per analytics page load. The `branchReports.ts` route (same endpoint, different path) correctly uses 2 aggregate queries with `GROUP BY branchId`. The `analytics.ts` branch route was never refactored.

**Fix:** Replace the `Promise.all` loop with two aggregate queries + in-memory join, identical to the pattern in `branchReports.ts:76-117`:
```ts
// One query: COUNT students GROUP BY branchId
// One query: SUM payments.amountCents GROUP BY students.branchId (already works in branchReports.ts)
// One query: COUNT lessons GROUP BY branchId
// Map results by branchId in memory
```

---

### MEDIUM: `mobile.ts:766-773` — Leaderboard N+1 (one XP sum per student)

```ts
// "N+1 but manageable for small classes" — comment in source
const withXP = await Promise.all(
  optInStudents.map(async (s) => {
    const result = await db.select({ total: sum(xpEvents.amount) })...
  })
);
```

The comment acknowledges the N+1. With 30+ opt-in students this fires 30+ queries. The fix is a single `GROUP BY studentId` aggregate:

```ts
const xpRows = await db
  .select({ studentId: xpEvents.studentId, total: sum(xpEvents.amount) })
  .from(xpEvents)
  .where(and(eq(xpEvents.tenantId, tenantId), inArray(xpEvents.studentId, optInStudents.map(s => s.id))))
  .groupBy(xpEvents.studentId);
```

But this also requires the `xpEvents` index from HIGH-3 above to be effective.

---

## 6. Data Type Issues

### MEDIUM: `paidOnline` stored as `varchar(5)` instead of `boolean`

**Schema file:** `server/db/schema/invoices.ts:56`

```ts
paidOnline: varchar("paid_online", { length: 5 }).default("false"),
```

This stores `"true"` / `"false"` as strings. Any boolean filtering (`WHERE paid_online = 'true'`) cannot use an index efficiently and is semantically odd. Should be `boolean("paid_online").notNull().default(false)`.

---

### LOW: `leads.branchId` — UUID FK without constraint

**Schema file:** `server/db/schema/leads.ts:83`

```ts
branchId: uuid("branch_id"),  // no .references(), no FK
```

The comment says "FK constraint added when branches table is on main". The `branches` table has been on main since migration 0027. The missing FK means orphaned `branchId` values are possible (deleted branch leaves stale UUIDs in leads). At minimum add:
```ts
branchId: uuid("branch_id").references(() => branches.id, { onDelete: "set null" }),
```

---

### LOW: `teachers.branchId` — same missing FK as leads

**Schema file:** `server/db/schema/teachers.ts:19`

Same pattern: FK to branches table never added. The index exists (`teachers_branch_idx`) but no referential integrity constraint.

---

## 7. Summary Priority Table

| Priority | Finding | File | Fix Effort |
|----------|---------|------|------------|
| HIGH | `server/index.ts:71` — bare `.rows` on execute result (breaks prod /api/health/db on PGlite or vice-versa) | server/index.ts | 1 line |
| HIGH | `payments` — no `paidAt` index (branch revenue analytics: full table scan) | schema/payments.ts + migration | Low |
| HIGH | `invoices` — no `dueDate` index (reminder sweep: full scan) | schema/invoices.ts + migration | Low |
| HIGH | `gamification` — `xpEvents`, `badges` have ZERO indexes | schema/gamification.ts + migration | Low |
| HIGH | `parentStudentLinks` — ZERO indexes (every parent app load: sequential scan) | schema/parentLinks.ts + migration | Low |
| HIGH | `directMessages` — ZERO indexes (message thread: full scan + sort) | schema/directMessages.ts + migration | Low |
| HIGH | `analytics.ts:300-353` — N+1 (3 queries × N branches per analytics load) | server/routes/analytics.ts | Medium |
| MEDIUM | `leads.branchId` — no index, no FK | schema/leads.ts + migration | Low |
| MEDIUM | `leads.courseId` — no index | schema/leads.ts + migration | Low |
| MEDIUM | `incidentReports.statusIdx` — no tenantId prefix | schema/kinderIncidents.ts + migration | Low |
| MEDIUM | `immunizationRecords.dueDateIdx` — no tenantId prefix | schema/kinderMedical.ts + migration | Low |
| MEDIUM | `sellerProfiles.tenantId` — should be unique, not just indexed | schema/sellerProfiles.ts + migration | Low |
| MEDIUM | `mobile.ts:766-773` — leaderboard N+1 (one XP query per student) | server/routes/mobile.ts | Low |
| MEDIUM | `paidOnline` stored as varchar not boolean | schema/invoices.ts + migration | Medium |
| LOW | `leads.branchId` — missing FK constraint to branches | schema/leads.ts + migration | Low |
| LOW | `teachers.branchId` — missing FK constraint to branches | schema/teachers.ts + migration | Low |

---

## 8. What Is Working Well

- Core multi-tenant columns (`tenantId`, `studentId`, `leadId`) are consistently indexed across the heaviest tables (`students`, `lessons`, `studentLessons`, `payments`, `invoices`, `messages`, `leadInteractions`).
- All monetary values use integer cents (no float precision risk).
- All timestamps use `timestamp with timezone` (`withTimezone: true`) consistently.
- `branchReports.ts` branch KPI route correctly uses aggregate queries (avoids N+1).
- `retention-by-course` analytics uses two bulk queries + in-memory grouping (correct pattern).
- The `Array.isArray()` portability guard is applied consistently across the majority of routes (~95%+ of query result handling).
- All 88 schema files are exported from `index.ts` — no silent `db.query.X is undefined` risks.
