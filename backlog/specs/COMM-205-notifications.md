---
id: COMM-205
title: "Notificări sistem automate: lecție mutată, absență, factură restantă + quiet hours + anti-spam"
milestone: COMM
phase: "5 — Notifications"
priority: P0
slug: notifications
depends_on: [COMM-201, COMM-204]
status: pending
---

# COMM-205 — Notificări sistem automate

## Goal

Notificări automate trimise de sistem la eventi din MVP (lecție mutată, elev absent, plată
restantă), cu respectarea quiet hours (22:00-08:00) și a cap-ului anti-spam (max 3
mesaje/destinatar/săptămână). Toate folosesc MessagingService din COMM-201.

## In scope

- **NotificationService** `server/services/notifications/NotificationService.ts`:
  - `sendNotification(tenantId, type, recipientId, channel, context)` → internamente apelează
    MessagingService, dar verifică quiet hours + anti-spam cap înainte
  - Quiet hours: dacă ora curentă UTC+offset (tenant timezone, default "Europe/Bucharest")
    e între 22:00-08:00 → schedule pentru 08:00 dimineața
  - Queue simplă: tabel `notification_queue` (id, tenant_id, payload jsonb, scheduled_for, sent_at)
  - Anti-spam cap: dacă destinatarul a primit ≥ 3 mesaje în ultimele 7 zile → skip + log
  - `flushQueue()` — procesare mesaje planificate (apelat din cron endpoint)
- **Schema DB**:
  - `notification_queue` tabel: `id, tenant_id, recipient_type, recipient_id, channel, payload jsonb, scheduled_for timestamp, sent_at timestamp?, skipped_reason varchar`
  - Migrare `0010_comm205_notification_queue.sql`
- **Triggere de notificare** (hookuri, nu cron real — apelate din route-urile existente):
  - `US-COM-10`: trigger din `PATCH /api/lessons/:id` când `start_time` se schimbă → notify parent
  - `US-COM-12`: trigger din `POST /api/payments/reminder` (endpoint nou, manual sau cron) → notify dacă plată restantă > 7 zile
  - `US-COM-11`: trigger opțional stub (placeholder — recovery lesson options) — va fi hook simplu
- **Endpoint cron** `POST /api/notifications/flush` (auth required, role=admin sau system key):
  - Procesează `notification_queue` unde `scheduled_for <= now() AND sent_at IS NULL`
  - Returnează `{ processed: N, skipped: M }`
- **Tenant timezone config**: câmp `timezone varchar(60) DEFAULT 'Europe/Bucharest'` în `tenants` tabel
  (migrare 0010 include și asta)
- **Anti-spam**: query `messages` + `notification_queue.sent_at` — count mesaje per destinatar ultimele 7 zile

## Out of scope

- Cron job real (scheduler extern) — endpoint manual / GitHub Actions invoke
- Push notifications PWA (US-COM-18 — P1, iterație viitoare)
- Quiet hours per-user override (iterație 2)
- Recovery lesson slot picker UI (US-COM-11 full — stub)

## Data / API

### notification_queue table
```ts
{
  id: uuid PK
  tenantId: uuid FK → tenants
  recipientType: enum(lead, student)
  recipientId: uuid
  channel: enum(email, sms, whatsapp)
  payload: jsonb { body, subject?, template_id?, context }
  scheduledFor: timestamp
  sentAt: timestamp?
  skippedReason: varchar(200)?
  createdAt: timestamp
}
```

### POST /api/notifications/flush
Response: `{ processed: number, skipped: number, errors: string[] }`

### PATCH /api/lessons/:id (modified)
When `start_time` changes: calls `NotificationService.sendNotification(...)` for student/parent
— inserts into `notification_queue` (respects quiet hours)

### POST /api/payments/reminders (new)
Body: `{ days_overdue: 7 | 14 | 21 }`
Finds payments overdue by N days, queues reminders for each.
Response: `{ queued: number, skipped_consent: number, skipped_spam: number }`

## Acceptance criteria

- [ ] Migrare 0010 cu `notification_queue` + `tenants.timezone` commitată
- [ ] NotificationService: quiet hours detectate → scheduled_for = 08:00 local
- [ ] Anti-spam cap: ≥ 3 mesaje/7 zile → skip cu reason
- [ ] POST /api/notifications/flush procesează coada + returnează stats
- [ ] Modificare lecție → row în notification_queue
- [ ] POST /api/payments/reminders → rows în notification_queue per plată restantă

## Tests

1. [blocant] POST /api/notifications/flush → 200 cu processed/skipped
2. [blocant] Anti-spam: al 4-lea mesaj în 7 zile → skipped_reason="spam_cap"
3. [blocant] Quiet hours: mesaj programat în 23:00 → scheduled_for = 08:00 dimineața
4. [normal] PATCH /api/lessons/:id cu nou start_time → row în notification_queue
5. [normal] POST /api/payments/reminders → queued > 0

## DoD

- Build + typecheck + lint verde
- Migration discipline: 0010 committed
- API smoke: POST /api/notifications/flush → 200
- Tests verzi
- Reviewer APPROVED
- Personas salvate
