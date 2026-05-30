# CRM-123 — Integration Architecture Review

**Verdict: CONNECTED**

## New table
- `notifications` with `tenant_id` → `tenants.id` (cascade) + `user_id` → `users.id` (cascade) ✅
- `notification_type` enum: task_due | lead_converted | lead_created | system ✅
- Exported from `server/db/schema/index.ts` ✅
- Migration `0008_neat_shatterstar.sql` committed ✅

## API routes
- `GET /api/notifications` — lists recent 20 for `(tenant_id, user_id)` + unread count ✅
- `PATCH /api/notifications/:id/read` — marks one, tenant+user scoped ✅
- `POST /api/notifications/read-all` — bulk mark, tenant+user scoped ✅
- Mounted at `/api/notifications` in `server/app.ts` ✅

## Cross-module event hooks
- `POST /api/leads` → fires `lead_created` notification to `assigned_to` user (or all managers/admins) ✅
- `POST /api/leads/:id/convert` → fires `lead_converted` notification to all managers/admins ✅
- Both are fire-and-forget (Promise.catch) — never block the response ✅

## AppShell integration
- `NotificationBell` component added to AppShell header ✅
- Polls every 30s silently ✅
- Badge count updates reactively ✅

## Tenant safety
- All DB queries use `AND tenant_id = current_user.tenantId` ✅
- `notifyManagersAndOwners` filters by `tenant_id` ✅
- No cross-tenant data leakage ✅
