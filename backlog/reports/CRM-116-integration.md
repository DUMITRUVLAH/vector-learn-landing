# CRM-116 Integration Architecture Review

**Verdict: CONNECTED**

## Feature
CRM-116 — Semnale de task pe card + aging + filtre kanban

## Module connectivity

### Data flow
- `nextTask` field already returned by `GET /api/leads/pipeline` (added in CRM-107)
- When `nextTask === null`: no open tasks for this lead → "Fără task" badge
- When `nextTask.dueAt < now()`: overdue → days count badge (red)
- When `nextTask.dueAt >= now()`: upcoming → date badge (amber)

### UI wiring
- `LeadsPage.KanbanCard`: conditional rendering of 3 badge states
- `LeadsPage.getFilteredLeads`: 2 new filter predicates (`filterNoTask`, `filterOverdue`)
- Filter bar: 2 new checkboxes, mutually exclusive

### No new API endpoints or DB changes
- Feature is entirely client-side, reusing existing `nextTask` augmentation from CRM-107
- No migration needed

### Cross-module safety
- Filters are client-side only — no additional API calls
- Tenant isolation unchanged (data already tenant-scoped from pipeline endpoint)

## No gaps found.
