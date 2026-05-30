# CRM-117 — Integration Architecture Review

**Verdict: CONNECTED**

## DB wiring
- `GET /api/leads?view=list` extended with `view`, `page`, `pageSize`, `sort`, `dir`, `source`, `assignedTo` query params.
- Query uses `count()` from drizzle-orm (not `db.$count()`, which doesn't exist in 0.36.x).
- Pagination: `limit(pageSize).offset(offset)` — correct server-side pagination.
- Next-task augmentation: only fetches tasks for the current page's leads (by `leadIds` filter).
- No raw `.execute().rows` — all results via query builder. DB portability ✓.

## Cross-module data flow
- Toggle state persists in `localStorage` per user — no server state needed.
- Same filter state (`filterSource`, `filterAssigned`, `searchQuery`) shared between kanban and list views.
- Stage inline edit calls `moveLeadStage` (existing API) and refreshes list.
- Row click navigates to `/app/leads/:id` — wired to `LeadCardPage`.

## API contract
- Response shape: `{ items, page, pageSize, total, totalPages }` — new shape for list view.
- Existing `GET /api/leads` without `view=list` still returns `{ items }` — backward compatible.

## Tenant safety
- All list queries start with `eq(leads.tenantId, tenantId)` — multi-tenant isolation confirmed.

## Migration
- No schema changes needed (feature is query-only). No migration required.
