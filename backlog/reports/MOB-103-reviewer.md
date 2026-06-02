# MOB-103 Code Review — Web Push VAPID notifications

**Reviewer**: code-reviewer-vl
**Date**: 2026-06-02
**Verdict**: APPROVED

## Summary
VAPID push infrastructure + subscription management API + notification settings UI implemented. Graceful no-op when VAPID keys not set — safe for dev/staging.

## Push utility (server/lib/push.ts)
- Dynamic import of `web-push` via `import("web-push" as string)` — avoids compile-time dependency, no-op if package absent.
- `isPushConfigured()` checks all 3 VAPID env vars before proceeding.
- `isQuietHours()` checks UTC+2 Romania time — simplification noted, good for now.
- On 410/404 from push endpoint → subscription deleted from DB. Correct behavior.
- Never throws — uses try/catch + `Promise.allSettled`. Production-safe.

## API endpoints
- `POST /api/m/push/subscribe` — upserts on same endpoint, correct.
- `DELETE /api/m/push/subscribe` — clean removal by endpoint.
- `PUT /api/m/push/categories` — category update.
- `GET /api/m/push/vapid-public-key` — returns null safely if VAPID not configured.
- All use `requireAuth` middleware.

## UI (NotificationsSettingsPage.tsx)
- No hardcoded colors — semantic tokens throughout.
- `aria-label` on back button.
- Category toggles show descriptions for each category.
- Graceful handling of: no VAPID key, browser unsupported, permission denied.

## Minor findings
- `setVapidDetails` called on every `sendPush` call — should be called once on startup. Acceptable for now (idempotent call).
- Quiet hours use fixed UTC+2 — should use tenant timezone from SET-802 settings. Track for MOB-106.

**Verdict: APPROVED**
