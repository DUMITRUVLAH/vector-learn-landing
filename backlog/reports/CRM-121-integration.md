# CRM-121 — Integration Architecture Review

**Verdict: CONNECTED**

## Responsive split
- `lg:hidden` / `hidden lg:grid` — pure CSS, no JS. Consistent with Tailwind/Vector 365 breakpoints.
- Mobile list receives filtered leads from LeadsPage (same filter logic as kanban) — no duplicate API calls.

## Data flow
- Mobile list uses `Object.values(grouped).flat()` — same `fetchPipeline()` data as kanban. Single source.
- Filter logic extracted inline (same as `getFilteredLeads`) — behavior identical between views.
- Stage change: `moveLeadStage(id, stage)` (existing API, CRM-105) — wired correctly.
- Lost reason: passes `lostReason` to `moveLeadStage` — same as kanban flow (CRM-105/CRM-106).

## Dependencies
- CRM-117 (list view) is separate. Mobile view is independent; both coexist on LeadsPage.
- CRM-109 (CommModal) not integrated here — swipe reveals tel: and wa.me links, no modal overlay. Acceptable for phase H scope.

## Tenant safety
- No new backend endpoints. All data from existing `fetchPipeline()` which is tenant-scoped.

## Migration
- No schema changes. Feature is purely frontend.
