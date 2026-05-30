---
id: CRM-123
title: Centru notificări in-app (clopoțel) — lead alocat / task scadent / mențiune
milestone: CRM
phase: H
priority: P1
core_ref: [CRM-CORE.md §2.5, §6.1]
tests: TEST-SCENARIOS.md#crm-123
depends_on: [CRM-107, CRM-111]
status: pending
---

# CRM-123 — Centru de notificări

## Goal
Vânzătorul ratează leaduri fierbinți pentru că nu știe că i s-a alocat unul sau că un task e
scadent. Adăugăm un centru de notificări in-app (clopoțel) care nu lasă nimic să cadă.

## In scope
- Tabel `notifications` (`id, tenant_id, user_id, type, title, body, link, read_at, created_at`).
- Trigger-e de notificare (server, la momentul acțiunii):
  - lead alocat ție (`assigned_to` schimbat),
  - task scadent (cron, refolosește pattern-ul `automations.post(/cron/no-contact)`),
  - lead nou nealocat în tenant (pentru manageri/recepție).
- UI: **clopoțel** în header cu badge count necitite; dropdown/panou cu listă, „marchează citit",
  „marchează toate citite". Click pe notificare → `link` (cartonaș/today).
- Endpoints: `GET /api/notifications`, `PATCH /api/notifications/:id/read`,
  `POST /api/notifications/read-all`. Tenant + user scoped.
- Respectă quiet hours dacă există (leagă cu COMM-205 dacă e prezent; altfel always-on in-app).

## Out of scope
- Push browser/PWA real (separat). Email/SMS de notificare (e COMM).

## Acceptance criteria
- [ ] Cele 3 trigger-e creează notificări corecte, user-scoped
- [ ] Clopoțel cu count necitite; marcare citit individual + toate
- [ ] Click → link corect (cartonaș/today)
- [ ] Migrare `notifications` generată + commisă (§3.5.1)
- [ ] Endpoints tenant-scoped; nu raw `.execute().rows`
- [ ] 0 axe critical/serious; dark mode OK

## Tests
`TEST-SCENARIOS.md#crm-123`. Blocante verzi (incl. integration smoke pe trigger + read).

## DoD
Standard.
