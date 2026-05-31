# CRM-120 — Integration Architecture Review

**Verdict: CONNECTED**

## DB wiring
- `GET /api/leads/today` aggregates from `lead_tasks` (JOIN with `leads`), `leads`, and `lead_interactions`.
- All queries use `eq(leads.tenantId, tenantId)` / `eq(leadTasks.tenantId, tenantId)` — tenant-scoped.
- No raw `.execute().rows` — all query builder. DB portability ✓.

## Cross-module data flow
- **Tasks** from CRM-107 (`lead_tasks` table) — correctly used for overdue/due-today section.
- **Interactions** from CRM-109 (`lead_interactions` table) — used to detect uncontacted leads and follow-up staleness.
- **Lead score** from CRM-111 (`leads.score`) — used for NBA sorting.
- All dependencies (CRM-107, CRM-111) are satisfied.

## Route mounting order (critical)
- `/api/leads/today` mounted BEFORE `/api/leads` in `app.ts`. Hono routes match in order, so the more specific path wins. ✓

## User-scoping
- Non-manager users: filtered by `assignedTo = userId` or unassigned leads. Prevents vânzători from seeing each other's leads.
- Manager/owner: sees all tenant leads. Correct business logic per CRM-CORE §2.3.

## Nav badge
- `AppShell` fetches `GET /api/leads/today` independently with `credentials: "include"`.
- Caches in `sessionStorage` (5 min) — acceptable for a badge counter.
- Graceful degradation if fetch fails — badge simply doesn't show.

## Tenant isolation
- T-CRM-120-7: tenant B getting tenant A's data is impossible — all queries start with `eq(tenantId)`.
