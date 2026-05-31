# CRM-124 Integration Review

**Verdict: CONNECTED**

## Migration discipline
- `drizzle/0008_strange_black_cat.sql`: 3 ALTER TABLE columns on `tenants` (sla_hot_minutes, sla_default_hours, rot_days)
- All with NOT NULL DEFAULT — safe for existing rows
- `db:generate` returns "No schema changes" after commit → migration is complete ✓

## Endpoint wiring
- `GET /api/leads/today/sla-config` → mounted at `/api/leads/today` (leadsTodayRoutes)
- `PATCH /api/leads/today/sla-config` → same router, protected by `requireAuth`
- Both endpoints are properly authorized (leadsTodayRoutes uses `requireAuth` middleware)

## Data flow
- Today dashboard now includes `neglected[]` and `slaConfig` in response ✓
- Pipeline endpoint computes `slaBadge` per lead from tenant SLA settings ✓
- `TodayDashboardResponse` interface updated in frontend to include new fields ✓
- Kanban cards display SLA badge (yellow/red only, green is implicit) ✓
- Today dashboard shows SLA badge per uncontacted lead ✓

## DB portability
- All queries use drizzle query builder, no raw `.execute().rows` ✓
- `db.query.tenants.findFirst()` — uses query builder ✓

## Cross-module impact
- `tenants` schema changed (3 new columns) — no FK impact on other tables ✓
- Today dashboard endpoint extended, not replaced — backward compatible ✓

## Verdict: CONNECTED
