---
id: MOB-103
title: Web Push notifications for students/parents
milestone: MOB
phase: "1"
status: pending
priority: P0
depends_on: [MOB-102, COMM-201]
spec: backlog/specs/MOB-103-push-notifications.md
---

## Goal

Implement Web Push API (VAPID) so students and parents receive push notifications when:
a homework is assigned, a grade is posted, or the schedule changes. Respects COMM-201's
`quiet_hours` and `consent_revoked_at`. Subscription management per-user (categories:
homework, schedule_change, grades).

---

## User stories

- **Ca Elev**, vreau să primesc push când profesorul adaugă temă nouă, pentru că o văd instant.
- **Ca Elev**, vreau să mă abonez pe categorii (teme, orar, note), pentru că nu vreau spam.
- **Ca Profesor**, vreau să trimit notificări la tot grupul când adaug o temă, pentru că îi alertez simultan.
- **Ca Director**, vreau respectate quiet hours și consent_revoked_at, pentru că nu deranjăm utilizatorii.

---

## Acceptance criteria

1. DB: new table `push_subscriptions` with columns:
   `id UUID PK`, `tenant_id UUID FK`, `user_id UUID FK users(id)`,
   `endpoint TEXT NOT NULL`, `keys_p256dh TEXT NOT NULL`, `keys_auth TEXT NOT NULL`,
   `categories JSONB DEFAULT '["homework","schedule_change","grades"]'`,
   `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ`.
2. VAPID keys generated server-side (`web-push` npm package). Stored in env vars
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`. If not set → push silently skipped (no crash).
3. API endpoints:
   - `POST /api/m/push/subscribe` — save PushSubscription object from browser.
   - `DELETE /api/m/push/subscribe` — unsubscribe current user.
   - `PUT /api/m/push/categories` — update subscribed categories.
4. Server utility `lib/push.ts` — `sendPush(userId, payload)` function:
   fetches subscriptions for user, checks quiet_hours (07:00–22:00 by default), checks
   `consent_revoked_at` on COMM-201 messages table as a proxy consent check, sends push.
   On 410 (expired sub) → deletes subscription from DB. Never throws — logs error, continues.
5. Teacher grading page: when teacher submits grade / creates homework → calls `sendPush`
   for all enrolled students in that lesson.
6. UI: `/m/settings/notifications` page with toggle per category (homework/schedule/grades)
   and a "Activează notificări" primary button that calls `Notification.requestPermission()`.
7. Migration file committed (`0038_mob103_push_subscriptions.sql`).
8. `db:reset && db:seed` succeeds.

---

## Files

- `server/db/schema/push.ts` — new
- `server/db/schema/index.ts` — export push_subscriptions
- `drizzle/0038_mob103_push_subscriptions.sql` — new migration
- `server/lib/push.ts` — sendPush utility
- `server/routes/mobile.ts` — push subscribe/unsubscribe/categories endpoints
- `src/pages/app/mobile/NotificationsSettingsPage.tsx` — new
- `src/pages/app/mobile/NotificationsSettingsPage.test.tsx` — new
- router — `/m/settings/notifications`

---

## Tests

- **T-MOB-103-1** `[blocant]` Given migration applied, When `db:reset && db:seed`, Then succeeds.
- **T-MOB-103-2** `[blocant]` Given student token, When POST `/api/m/push/subscribe` with valid PushSubscription body, Then 201 and subscription saved in DB.
- **T-MOB-103-3** `[blocant]` Given sendPush called with expired endpoint (410 mocked), When push sent, Then subscription deleted and no error thrown.
- **T-MOB-103-4** `[normal]` Given VAPID keys not set in env, When sendPush called, Then skips silently (returns without crash).
- **T-MOB-103-5** `[normal]` Given `NotificationsSettingsPage` rendered, When component mounts, Then shows toggles for homework/schedule/grades categories.
- **T-MOB-103-6** `[normal]` Given quiet hours (22:00-07:00), When sendPush called at 23:00, Then push deferred/skipped.

---

## Definition of Done

- [ ] `push_subscriptions` table migrated
- [ ] VAPID push infra working (graceful no-op without env keys)
- [ ] Subscribe/unsubscribe/categories API working
- [ ] sendPush utility integrated into grading/homework creation flow
- [ ] All T-MOB-103-* tests green
- [ ] Migration gate green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/MOB-faza-1-student-pwa`
