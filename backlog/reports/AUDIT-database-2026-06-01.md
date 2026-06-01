# Database Performance Audit — 2026-06-01

Stack: Drizzle ORM + Supabase Postgres (prod) + PGlite (local/test)
Audited by: database-optimizer agent

---

## Executive Summary

24 findings across 6 categories. The three highest-impact clusters are:

1. **N+1 query loops** — four separate endpoints perform one DB query per row in application code instead of using a single batched SQL query. The worst offenders are `GET /api/feedback` (2 queries × N forms), `GET /api/feedback/:id/responses` (1 query × N invitations), `GET /api/cadences` (1 query × N cadences), and the payroll calculate endpoint (3 queries × N teachers).

2. **Missing `leadInteractions` filter in `/api/leads/today`** — the outbound-interaction fetch at lines 100-108 of `leads-today.ts` has no `inArray(leadInteractions.leadId, recentLeadIds)` filter, so it scans the entire `lead_interactions` table for the tenant. On a tenant with thousands of interactions this returns the full history, then discards it in application code.

3. **Bulk-tag loop in `POST /api/leads/bulk-action` (tag action)** — lines 1274-1280 of `leads.ts` insert tags one row at a time inside a `for` loop. This can issue up to 200 individual INSERT statements for a 200-lead bulk tag.

No raw `db.execute(...).rows` (PGlite portability bug) was found in business routes. The two `db.execute` calls in `app.ts` correctly handle both shapes. The `contracts.ts` and `feedback*.ts` files use the approved `Array.isArray(r) ? r : r.rows ?? r` pattern throughout. Migration health is clean — 24 committed migrations cover every table defined in `server/db/schema/`.

---

## Findings by Impact

### HIGH

---

#### H-1: Missing filter on `leadInteractions` in `GET /api/leads/today` — full-table scan

**File:** `server/routes/leads-today.ts` lines 96–109

**Code:**
```ts
// Find which of these have an outbound interaction
const outboundInteractions = await db
  .select({ leadId: leadInteractions.leadId })
  .from(leadInteractions)
  .where(and(
    eq(leadInteractions.tenantId, tenantId),
    eq(leadInteractions.direction, "outbound"),
    // Only check for the recent leads   ← comment promises a filter that was never written
  ));
contactedIds = new Set(outboundInteractions.map((i) => i.leadId));
```

**Why it is slow:** The WHERE clause stops at `tenantId + direction = outbound`. On a tenant with 50 000 interactions this returns every outbound interaction ever recorded, then the application builds a Set and checks membership. The comment in the code says "Only check for the recent leads" but the `inArray` condition was never added. The `li_tenant_idx` index on `(tenant_id)` will be used but still scans all outbound interactions for the tenant.

A second identical problem occurs at lines 145–163 for the follow-up section: the query fetches every outbound interaction for the tenant without filtering to `contactedTrialIds`.

And a third at lines 265–279 for the neglected section: it fetches all interactions since `rotCutoff` with no `inArray` on `activeLeadIds`.

**Fix:** Add `inArray` filters so each sub-query scans only the relevant lead IDs:

```ts
// Section 2 — new uncontacted
if (recentLeadIds.length > 0) {
  const outboundInteractions = await db
    .select({ leadId: leadInteractions.leadId })
    .from(leadInteractions)
    .where(and(
      eq(leadInteractions.tenantId, tenantId),
      eq(leadInteractions.direction, "outbound"),
      inArray(leadInteractions.leadId, recentLeadIds)   // ← add this
    ));
  contactedIds = new Set(outboundInteractions.map((i) => i.leadId));
}

// Section 3 — follow-up
if (contactedTrialIds.length > 0) {
  const interactions = await db
    .select({ leadId: leadInteractions.leadId, occurredAt: leadInteractions.occurredAt })
    .from(leadInteractions)
    .where(and(
      eq(leadInteractions.tenantId, tenantId),
      eq(leadInteractions.direction, "outbound"),
      inArray(leadInteractions.leadId, contactedTrialIds),  // ← add this
      lt(leadInteractions.occurredAt, now)
    ))
    .orderBy(desc(leadInteractions.occurredAt));
}

// Section 5 — neglected
if (activeLeadIds.length > 0) {
  const recentInteractions = await db
    .select({ leadId: leadInteractions.leadId, occurredAt: leadInteractions.occurredAt })
    .from(leadInteractions)
    .where(and(
      eq(leadInteractions.tenantId, tenantId),
      gte(leadInteractions.occurredAt, rotCutoff),
      inArray(leadInteractions.leadId, activeLeadIds)   // ← add this
    ))
    .orderBy(desc(leadInteractions.occurredAt));
}
```

Pair with the existing `li_lead_idx` on `(lead_id, occurred_at)` — the index already covers this query shape.

---

#### H-2: N+1 in `GET /api/feedback` — 2 queries per form

**File:** `server/routes/feedback.ts` lines 58–92

**Code:**
```ts
const enriched = await Promise.all(
  formList.map(async (form) => {
    const invRows = await db.select(...).from(feedbackInvitations)
      .where(eq(feedbackInvitations.formId, form.id));  // 1 query × N forms

    const scoreRows = await db.select(...).from(feedbackAnswers)
      .innerJoin(feedbackInvitations, ...)
      .where(and(eq(feedbackInvitations.formId, form.id), ...));  // 1 query × N forms
```

**Why it is slow:** For a tenant with 20 feedback forms this issues 1 + 20 + 20 = 41 round-trips to the database for a single GET. Postgres connection latency (even local) makes this O(N×RTT).

**Fix:** Replace with two batched queries, then join in application memory:

```ts
const formIds = formList.map((f) => f.id);

// One query: all invitations for these forms
const allInvitations = await db
  .select({ formId: feedbackInvitations.formId, status: feedbackInvitations.status })
  .from(feedbackInvitations)
  .where(inArray(feedbackInvitations.formId, formIds));

// One query: all numeric answers for these forms
const allScores = await db
  .select({ formId: feedbackInvitations.formId, val: feedbackAnswers.value })
  .from(feedbackAnswers)
  .innerJoin(feedbackInvitations, eq(feedbackAnswers.invitationId, feedbackInvitations.id))
  .innerJoin(feedbackQuestions, eq(feedbackAnswers.questionId, feedbackQuestions.id))
  .where(and(
    inArray(feedbackInvitations.formId, formIds),
    sql`${feedbackQuestions.type} IN ('rating', 'nps')`
  ));

// Group in application memory — O(answers) not O(forms × RTT)
const invByForm = groupBy(allInvitations, (i) => i.formId);
const scoresByForm = groupBy(allScores, (s) => s.formId);

const enriched = formList.map((form) => {
  const invs = invByForm[form.id] ?? [];
  const scores = (scoresByForm[form.id] ?? [])
    .map((s) => s.val ? parseFloat(s.val) : NaN).filter((n) => !isNaN(n));
  return {
    ...form,
    totalInvitations: invs.length,
    submittedCount: invs.filter((i) => i.status === "submitted").length,
    averageScore: scores.length > 0 ? scores.reduce((a, b) => a + b) / scores.length : null,
  };
});
```

---

#### H-3: N+1 in `GET /api/feedback/:id/responses` — 1 query per submitted invitation

**File:** `server/routes/feedback.ts` lines 262–276

**Code:**
```ts
const withAnswers = await Promise.all(
  invList.map(async (inv) => {
    if (inv.status !== "submitted") return { ...inv, answers: [] };
    const ansRows = await db.select(...)
      .from(feedbackAnswers)
      .where(eq(feedbackAnswers.invitationId, inv.id));  // 1 query × N submitted invitations
```

**Fix:** Single batched query:

```ts
const submittedIds = invList.filter((i) => i.status === "submitted").map((i) => i.id);

const allAnswers = submittedIds.length > 0
  ? await db.select({ invitationId: feedbackAnswers.invitationId, questionId: feedbackAnswers.questionId, value: feedbackAnswers.value })
      .from(feedbackAnswers)
      .where(inArray(feedbackAnswers.invitationId, submittedIds))
  : [];

const answersByInv = groupBy(allAnswers, (a) => a.invitationId);

const withAnswers = invList.map((inv) => ({
  ...inv,
  answers: inv.status === "submitted" ? (answersByInv[inv.id] ?? []) : [],
}));
```

---

#### H-4: N+1 in payroll calculate — 3 queries per teacher

**File:** `server/routes/payroll.ts` lines 81–158

**Code:**
```ts
for (const teacher of teacherRows) {
  // 1. SELECT lessons for this teacher  (1 query × N teachers)
  const completedLessons = await db.select(...).from(lessons)
    .where(and(eq(lessons.teacherId, teacher.id), ...));

  // 2. findFirst payroll entry (1 query × N teachers)
  const existing = await db.query.payrollEntries.findFirst({
    where: and(eq(payrollEntries.teacherId, teacher.id), ...),
  });

  // 3. UPDATE or INSERT payroll (1 query × N teachers)
  if (existing) { ...update... } else { ...insert... }
}
```

**Why it is slow:** For a school with 20 teachers this issues 60 sequential DB round-trips for a payroll recalculate. Each round-trip includes a separate Postgres parse+plan cycle.

**Fix:** Hoist the lesson fetch out of the loop with a single query, then aggregate per-teacher in JavaScript:

```ts
const teacherIds = teacherRows.map((t) => t.id);

// Single query: all completed lessons for all teachers in the month
const allLessons = await db
  .select({ id: lessons.id, teacherId: lessons.teacherId,
            scheduledAt: lessons.scheduledAt, durationMinutes: lessons.durationMinutes })
  .from(lessons)
  .where(and(
    eq(lessons.tenantId, tenantId),
    inArray(lessons.teacherId, teacherIds),
    eq(lessons.status, "completed"),
    gte(lessons.scheduledAt, monthStart),
    lt(lessons.scheduledAt, monthEnd)
  ));

const lessonsByTeacher = groupBy(allLessons, (l) => l.teacherId);

// Single query: all existing payroll entries for this month
const existingEntries = await db
  .select()
  .from(payrollEntries)
  .where(and(
    eq(payrollEntries.tenantId, tenantId),
    eq(payrollEntries.month, month),
    inArray(payrollEntries.teacherId, teacherIds)
  ));

const existingByTeacher = new Map(existingEntries.map((e) => [e.teacherId, e]));

// Now loop: only upsert queries remain (no lesson-fetch inside loop)
for (const teacher of teacherRows) {
  const tLessons = lessonsByTeacher[teacher.id] ?? [];
  // ... calculate totals ...
  const existing = existingByTeacher.get(teacher.id);
  if (existing) { ...update... } else { ...insert... }
}
```

---

### MEDIUM

---

#### M-1: N+1 in `GET /api/cadences` — 1 count query per cadence

**File:** `server/routes/cadences.ts` lines 63–78

**Code:**
```ts
const enriched = await Promise.all(
  rows.map(async (cad) => {
    const [{ value: activeCount }] = await db
      .select({ value: count() })
      .from(leadCadenceEnrollments)
      .where(and(
        eq(leadCadenceEnrollments.cadenceId, cad.id),
        eq(leadCadenceEnrollments.status, "active")
      ));  // 1 query × N cadences
```

**Fix:** One GROUP BY query:

```ts
const cadenceIds = rows.map((r) => r.id);
const countRows = await db
  .select({ cadenceId: leadCadenceEnrollments.cadenceId, cnt: count() })
  .from(leadCadenceEnrollments)
  .where(and(
    inArray(leadCadenceEnrollments.cadenceId, cadenceIds),
    eq(leadCadenceEnrollments.status, "active")
  ))
  .groupBy(leadCadenceEnrollments.cadenceId);

const countMap = new Map(countRows.map((r) => [r.cadenceId, Number(r.cnt)]));
const enriched = rows.map((cad) => ({ ...cad, activeEnrollments: countMap.get(cad.id) ?? 0 }));
```

---

#### M-2: Bulk-tag loop — up to 200 individual INSERTs

**File:** `server/routes/leads.ts` lines 1274–1280

**Code:**
```ts
} else if (action === "tag") {
  for (const leadId of ownedIds) {
    try {
      await db.insert(leadTags).values({ tenantId, leadId, tag }).onConflictDoNothing();
      processed++;
    } catch { ... }
  }
```

**Fix:** Single batch insert with `onConflictDoNothing`:

```ts
await db.insert(leadTags)
  .values(ownedIds.map((leadId) => ({ tenantId, leadId, tag })))
  .onConflictDoNothing();
processed = ownedIds.length;
```

---

#### M-3: N+1 in `GET /api/feedback/:id` — 1 query per numeric question

**File:** `server/routes/feedback.ts` lines 158–178

**Code:**
```ts
const qStats = await Promise.all(
  qList.filter((q) => q.type === "rating" || q.type === "nps")
    .map(async (q) => {
      const ansRows = await db.select(...).from(feedbackAnswers)
        .where(and(eq(feedbackAnswers.questionId, q.id), ...));  // 1 query × N numeric questions
```

**Fix:** Single join with GROUP BY aggregation in SQL:

```ts
const numericQIds = qList.filter((q) => q.type === "rating" || q.type === "nps").map((q) => q.id);
const qStats = numericQIds.length > 0
  ? await db
      .select({
        questionId: feedbackAnswers.questionId,
        avg: sql<number>`AVG(CAST(${feedbackAnswers.value} AS float))`,
        cnt: count(feedbackAnswers.id),
      })
      .from(feedbackAnswers)
      .innerJoin(feedbackInvitations, eq(feedbackAnswers.invitationId, feedbackInvitations.id))
      .where(and(
        eq(feedbackInvitations.formId, form.id),
        inArray(feedbackAnswers.questionId, numericQIds)
      ))
      .groupBy(feedbackAnswers.questionId)
  : [];
```

---

#### M-4: Unbounded pipeline list — no LIMIT on `GET /api/leads/pipeline`

**File:** `server/routes/leads.ts` lines 382–391

**Code:**
```ts
leadRoutes.get("/pipeline", async (c) => {
  const items = await db
    .select()
    .from(leads)
    .where(eq(leads.tenantId, tenantId))
    .orderBy(desc(leads.createdAt));  // no LIMIT
```

**Why it is slow:** A tenant with 5 000 leads (routine for Andreea's 1 400-student academy) returns all 5 000 rows over the wire to the API process, then the handler groups them in JavaScript. Every kanban render does a full table scan for that tenant.

**Fix:** Paginate per-column or add a practical hard cap. The kanban grouping should move server-side:

```ts
// Option A: hard cap (pragmatic)
.limit(500)

// Option B: paginated pipeline endpoint with stage filter already in leads.ts list view
```

Also, the handler fetches ALL open tasks for the tenant to build `nextTaskMap`:

```ts
const openTasks = await db.select().from(leadTasks)
  .where(and(eq(leadTasks.tenantId, tenantId), eq(leadTasks.status, "open")))
  .orderBy(asc(leadTasks.dueAt));  // no LIMIT, no inArray filter
```

With 500 leads loaded, the tasks fetch should be filtered to `inArray(leadTasks.leadId, items.map(l => l.id))`.

---

#### M-5: Unbounded default list query on `GET /api/leads` (no `view=list`)

**File:** `server/routes/leads.ts` lines 372–379

**Code:**
```ts
// Default: simple list (no pagination)
const items = await db
  .select()
  .from(leads)
  .where(and(...conditions))
  .orderBy(desc(leads.createdAt));
// no LIMIT
```

Every call to `/api/leads` without `view=list` returns the entire tenant's lead list. The pipeline view, kanban drag sources, and pickers all call this endpoint. With 5 000 leads this transfers 5 000 full rows (including notes, consent fields, UTM fields) every time.

**Fix:** Apply a default limit (e.g., 1000) or require callers to use `view=list` with pagination. The pipeline endpoint already exists separately; the default list path should be sunset or capped.

---

#### M-6: Three separate COUNT queries in `GET /api/payments/stats`

**File:** `server/routes/payments.ts` lines 46–76

**Code:**
```ts
const [{ paid }] = await db.select(...).from(payments).where(and(..., eq(status, "paid"), ...));
const [{ pending }] = await db.select(...).from(payments).where(and(..., eq(status, "pending")));
const [{ overdue }] = await db.select(...).from(payments).where(and(..., eq(status, "overdue")));
```

Three sequential queries where a single conditional aggregation suffices.

**Fix:**

```ts
const stats = await db
  .select({
    status: payments.status,
    total: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
  })
  .from(payments)
  .where(and(
    eq(payments.tenantId, tenantId),
    sql`${payments.status} IN ('paid', 'pending', 'overdue')`
  ))
  .groupBy(payments.status);

const byStatus = Object.fromEntries(stats.map((r) => [r.status, r.total]));
// monthPaidCents still needs the paidAt >= monthStart filter — keep separate or add CASE WHEN
```

---

#### M-7: Pipeline-stage N+1 reorder — one UPDATE per stage

**File:** `server/routes/pipeline.ts` lines 108–115

**Code:**
```ts
await Promise.all(
  order.map((stageId, idx) =>
    db.update(pipelineStages).set({ orderIndex: idx })
      .where(and(eq(pipelineStages.id, stageId), eq(pipelineStages.tenantId, tenantId)))
  )
);
```

Reordering 10 stages issues 10 parallel UPDATE statements. Each hits a separate backend connection slot.

**Fix:** Use an unnest-based batch update or a CASE WHEN expression to handle all rows in one statement:

```sql
UPDATE pipeline_stages SET order_index = v.idx
FROM (VALUES ($1::uuid, 0), ($2::uuid, 1), ...) AS v(id, idx)
WHERE pipeline_stages.id = v.id AND pipeline_stages.tenant_id = $tenantId
```

In Drizzle: use `db.execute(sql`UPDATE pipeline_stages SET order_index = v.idx FROM (VALUES ...) AS v(id, idx) WHERE ...`)`.

---

#### M-8: `cadences/tick` — 1 lead fetch per due enrollment

**File:** `server/routes/cadences.ts` lines 231–235

**Code:**
```ts
for (const { enrollment, cadence } of dueEnrollments) {
  ...
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, enrollment.leadId),  // 1 query × N due enrollments
  });
```

For a tenant with 200 enrollments due simultaneously (after a holiday) this is 200 sequential lead fetches.

**Fix:** Batch-fetch all leads before the loop:

```ts
const leadIds = [...new Set(dueEnrollments.map(({ enrollment }) => enrollment.leadId).filter(Boolean))];
const leadRows = leadIds.length > 0
  ? await db.select().from(leads).where(inArray(leads.id, leadIds))
  : [];
const leadMap = new Map(leadRows.map((l) => [l.id, l]));

for (const { enrollment, cadence } of dueEnrollments) {
  const lead = enrollment.leadId ? leadMap.get(enrollment.leadId) : undefined;
  ...
}
```

---

### LOW

---

#### L-1: Missing composite index for `(tenant_id, assigned_to)` on `leads`

**File:** `server/db/schema/leads.ts`

The leads list and pipeline view filter by `assigned_to` (lines 274–279 of `leads.ts`) alongside `tenant_id`, and the `GET /api/leads/today` dashboard filters by `assigned_to` for non-manager users. There is no index on this column combination.

**Fix:**

```sql
CREATE INDEX leads_assigned_idx ON leads (tenant_id, assigned_to)
WHERE assigned_to IS NOT NULL;
```

In Drizzle schema:
```ts
assignedIdx: index("leads_assigned_idx")
  .on(t.tenantId, t.assignedTo)
  .where(sql`${t.assignedTo} IS NOT NULL`),
```

---

#### L-2: Missing index on `leads.score` for NBA ordering

**File:** `server/routes/leads-today.ts` lines 211–216

The Next Best Action query at line 211 orders by `desc(leads.score), asc(leads.createdAt)` with a `WHERE tenant_id = X AND stage NOT IN ('paid','lost')`. The `stageIdx` index on `(tenant_id, stage)` does not help with DESC ordering on `score`.

**Fix:**

```sql
CREATE INDEX leads_nba_idx ON leads (tenant_id, score DESC, created_at ASC)
WHERE stage NOT IN ('paid', 'lost');
```

In Drizzle:
```ts
nbaIdx: index("leads_nba_idx")
  .on(t.tenantId, desc(t.score), asc(t.createdAt))
  .where(sql`${t.stage} NOT IN ('paid', 'lost')`),
```

---

#### L-3: Missing index on `leads.created_at` for 48h window query (leads-today section 2)

**File:** `server/routes/leads-today.ts` line 89

The new-uncontacted query filters `leads.createdAt >= _48hAgo` but the existing `stageIdx` on `(tenant_id, stage)` does not include `created_at`. This requires a filter pass over all tenant leads to find recent ones.

**Fix:**

```sql
CREATE INDEX leads_created_tenant_idx ON leads (tenant_id, created_at DESC);
```

This index also benefits the default `GET /api/leads` ordering by `created_at DESC`.

---

#### L-4: `adCampaignBudgets` missing composite unique constraint

**File:** `server/db/schema/analytics.ts`

The upsert in `POST /api/analytics/crm/budgets` (analytics.ts lines 236–258) checks for an existing row with `(tenant_id, utm_campaign, month)` via `findFirst`, then inserts or updates. There is no UNIQUE constraint on this triple, so two concurrent requests can create duplicates, and the ROAS aggregation (which sums all months) will double-count spend.

**Fix — schema:**

```ts
uniqueBudget: uniqueIndex("acb_unique_idx").on(t.tenantId, t.utmCampaign, t.month),
```

**Fix — upsert instead of check-then-insert:**

```ts
await db.insert(adCampaignBudgets)
  .values({ tenantId, utmCampaign, spendCents, month })
  .onConflictDoUpdate({
    target: [adCampaignBudgets.tenantId, adCampaignBudgets.utmCampaign, adCampaignBudgets.month],
    set: { spendCents, updatedAt: new Date() },
  });
```

---

#### L-5: `leadContacts.isPrimary` stored as `integer` instead of `boolean`

**File:** `server/db/schema/leads.ts` line 139

```ts
isPrimary: integer("is_primary").notNull().default(0),
```

This stores 0/1 instead of using Postgres `BOOLEAN`. The route handlers cast back and forth with `body.isPrimary ? 1 : 0` and comparisons. Using `boolean` is cleaner, avoids accidental non-zero integer values, and works with any tooling that inspects the schema.

**Fix:** Migrate to `boolean("is_primary").notNull().default(false)`. Breaking change — requires a migration:

```sql
ALTER TABLE lead_contacts
  ALTER COLUMN is_primary TYPE boolean
  USING is_primary::boolean,
  ALTER COLUMN is_primary SET DEFAULT false;
```

---

#### L-6: `db.execute` portability — two surviving raw calls in `app.ts`

**File:** `server/app.ts` lines 65 and 113

```ts
// line 65 — health ping
await db.execute(sql`SELECT 1 as ping`);

// line 113 — health/db table count
const tablesResult = await db.execute(sql`SELECT count(*)::int ...`);
const tableRows = (Array.isArray(tablesResult) ? tablesResult : tablesResult.rows) as ...
```

Both calls correctly handle the PGlite vs Postgres difference with `Array.isArray(tablesResult) ? tablesResult : tablesResult.rows`. These are non-business health endpoints. Low risk, but if Drizzle's ORM layer ever changes the PGlite adapter shape, this silently breaks the `/api/health/db` endpoint.

**Recommendation:** The `SELECT 1` ping can be replaced with `db.select({ ping: sql<number>`1` }).from(sql`(VALUES (1)) AS t(v)`)` to stay in the query builder. The table-count query is legitimately SQL-only and the portability guard is in place — acceptable as-is.

---

#### L-7: ROAS endpoint runs three sequential tenant-scoped table scans

**File:** `server/routes/analytics.ts` lines 120–165

Three separate `SELECT ... FROM leads WHERE tenant_id = ? GROUP BY utm_campaign` queries (paid leads, all leads, then budgets). All three can be merged:

```ts
const [leadsStats, budgets] = await Promise.all([
  db.select({
    campaign: leads.utmCampaign,
    totalCount: count(leads.id),
    paidCount: sql<number>`count(*) FILTER (WHERE ${leads.stage} = 'paid')`,
  })
  .from(leads)
  .where(and(eq(leads.tenantId, tenantId), isNotNull(leads.utmCampaign)))
  .groupBy(leads.utmCampaign),

  db.select().from(adCampaignBudgets).where(eq(adCampaignBudgets.tenantId, tenantId)),
]);
```

This halves the query count from 3 to 2 (parallel) and removes one full `leads` table scan.

---

#### L-8: `feedbackInvitations` insert missing `tenantId` — latent data isolation risk

**File:** `server/routes/feedback.ts` lines 222–225

```ts
const inserted = await db
  .insert(feedbackInvitations)
  .values({ formId, studentId })   // ← tenantId not stored
  .returning();
```

The `feedbackInvitations` table in `server/db/schema/feedback.ts` has no `tenant_id` column — it derives tenant isolation through `form_id → feedback_forms.tenant_id`. The public submission endpoint in `feedbackPublic.ts` re-validates the token against the form. However:

- Any cross-tenant query on `feedbackInvitations` by `studentId` directly would leak invitations.
- Future endpoints that query by `student_id` without joining back to `feedback_forms` will return cross-tenant data if students are ever shared.

**Fix:** Add `tenantId` to `feedbackInvitations` for defense-in-depth:

```ts
// schema
tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
```

```sql
-- migration
ALTER TABLE feedback_invitations ADD COLUMN tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX feedback_invitations_tenant_idx ON feedback_invitations (tenant_id);
```

---

## Migration Health

All 24 committed migrations in `drizzle/` cover every table defined in `server/db/schema/`. No schema drift detected. The `server/db/schema/index.ts` exports 28 schema files; all are covered by migrations 0000–0023.

Notable: the `tenants` table gained three SLA columns (`sla_hot_minutes`, `sla_default_hours`, `rot_days`) in migration `0018_crm124_sla.sql` and the `pipeline_stages` table gained `probability_pct` in `0019_crm125_forecast.sql`. Both are present in the schema and the migration SQL. Clean.

---

## Index Inventory — what exists vs what is missing

### Well-indexed (no action needed)

| Table | Indexes |
|---|---|
| leads | (tenant_id), (tenant_id, stage), (tenant_id, phone_normalized), (tenant_id, email_normalized) |
| lead_interactions | (tenant_id), (lead_id, occurred_at) |
| lead_tasks | (tenant_id), (lead_id), (tenant_id, status) |
| students | (tenant_id), (tenant_id, status), (tenant_id, full_name) |
| payments | (tenant_id), (student_id), (tenant_id, status) |
| lessons | (tenant_id), (teacher_id, scheduled_at), (tenant_id, scheduled_at) |
| pipeline_stages | (tenant_id), (tenant_id, key) |
| notifications | (tenant_id), (user_id, is_read, created_at) |
| lead_cadence_enrollments | (tenant_id), (lead_id, status), (status, next_fire_at), (cadence_id) |

### Missing indexes (add these)

| Table | Recommended index | Driven by |
|---|---|---|
| leads | `(tenant_id, assigned_to) WHERE assigned_to IS NOT NULL` | leads list, today dashboard |
| leads | `(tenant_id, score DESC, created_at ASC) WHERE stage NOT IN ('paid','lost')` | NBA query |
| leads | `(tenant_id, created_at DESC)` | 48h window, default list order |
| ad_campaign_budgets | UNIQUE `(tenant_id, utm_campaign, month)` | upsert correctness |
| feedback_invitations | `tenant_id` column + index (see L-8) | data isolation |

---

## DB Portability (.rows pattern)

The following files use the `Array.isArray(r) ? r : r.rows ?? r` pattern. This is the approved portability guard — no raw `.rows` accesses without the array check were found.

- `server/app.ts` lines 117 — correctly guarded
- `server/routes/contracts.ts` lines 60, 129, 148, 190, 205, 220 — all guarded
- `server/routes/feedback.ts` lines 55, 65, 82, 109, 130, 145, 155, 173, 185, 210, 219, 227, 244, 259, 273 — all guarded
- `server/routes/feedbackPublic.ts` lines 33, 42, 52, 88 — all guarded

No unguarded `result.rows[0]` pattern was found anywhere in `server/`.

---

## Recommended Fix Priority

| # | Finding | Effort | Impact |
|---|---|---|---|
| 1 | H-1: Add inArray filters in leads-today.ts | 30 min | High — eliminates 3 full table scans per dashboard load |
| 2 | H-2: Batch feedback GET / list | 1h | High — 40+ queries → 3 |
| 3 | H-3: Batch feedback responses | 30 min | High — N queries → 1 |
| 4 | H-4: Batch payroll calculate | 1h | Medium-High — 3N queries → 3+N |
| 5 | M-1: Batch cadence enrollment count | 30 min | Medium |
| 6 | M-2: Batch bulk-tag insert | 15 min | Medium |
| 7 | M-4: Add LIMIT to pipeline and list endpoints | 30 min | Medium — prevents OOM on large tenants |
| 8 | L-1: Add (tenant_id, assigned_to) index | 10 min | Low-Medium |
| 9 | L-4: Add unique constraint on ad_campaign_budgets | 10 min | Low — data integrity |
| 10 | L-7: Merge ROAS queries | 20 min | Low |
