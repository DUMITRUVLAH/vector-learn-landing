# REP-301 Integration Report

## Verdict: CONNECTED

- GET /api/analytics/kpi reads from payments (MRR) + students (active, new, churn)
- Tenant-scoped
- Period toggle → different time windows in same endpoint
- KpiDashboardPage at /app/analytics/kpi registered in App.tsx + AppShell nav
