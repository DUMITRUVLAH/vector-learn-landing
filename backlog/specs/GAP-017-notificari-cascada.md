---
id: GAP-017
title: Notificări în cascadă (WhatsApp → Telegram → SMS → Push)
milestone: GAP
phase: 3
priority: MEDIUM
status: pending
dependencies: [COMM-205, messages, students, leads]
feeds_into: [GAP-009, GAP-003, GAP-008]
branch: feat/GAP-faza-3-portal-notificari
---

## Scop

Extinde coada de notificări cu fallback: dacă un mesaj WhatsApp nu e livrat în N minute, încearcă canalul următor din ordinea configurată per tenant. Crește rata de livrare a notificărilor critice.

## Criterii de acceptare

- [ ] Tabel `notification_channel_config`: `id uuid PK`, `tenantId uuid FK UNIQUE`, `channelOrder jsonb` (ex: `["whatsapp","telegram","sms","push"]`), `fallbackTimeoutMinutes integer default 15`, `createdAt`, `updatedAt`
- [ ] La expirarea `fallbackTimeoutMinutes` fără delivery receipt pe canalul curent, se creează o înregistrare nouă în `notification_queue` pentru canalul următor cu `parentNotificationId` FK
- [ ] Delivery receipt marcat când canalul confirmă livrarea (câmp `deliveredAt timestamp null` pe `messages`)
- [ ] Configurare vizibilă și editabilă în Settings → Notificări
- [ ] Dacă toate canalele eșuează, mesajul capătă `skippedReason: 'all_channels_failed'` și e logat în audit
- [ ] Job cron (sau lazy check la următoarea notificare) verifică `fallbackTimeoutMinutes`

## Fișiere implicate

- `server/db/schema/` — tabel `notification_channel_config`
- `server/db/schema/messages.ts` — câmp `deliveredAt`, `parentNotificationId`
- `server/routes/notifications.ts` — logică fallback
- `src/pages/app/` (Settings) — configurare ordine canale

## Teste

- Unit: după timeout, notificare creată pe canalul următor cu `parentNotificationId` corect
- Unit: delivery receipt → nu mai creează fallback
- Unit: toate canalele eșuează → `skippedReason` setat

## DoD

Build + typecheck + lint + teste verzi. Migrare comisă. PR pe branch `feat/GAP-faza-3-portal-notificari`.
