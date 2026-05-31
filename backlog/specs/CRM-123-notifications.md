---
id: CRM-123
slug: notifications
depends_on: [CRM-107, CRM-111]
phase: H
milestone: CRM
---

# CRM-123 — Notificări in-app (bell icon + feed + preferințe)

## Goal

Adaugă un sistem de notificări in-app: badge cu numărul de notificări necitite pe clopotelul din header, un feed dropdown cu notificările recente (task-uri scadente, conversii, leads noi), și un tabel `notifications` în DB cu stare read/unread.

## User stories

- **US-CRM-123-1**: Ca vânzător, vreau să văd un badge pe clopot cu numărul de notificări necitite, ca să știu imediat dacă am ceva nou.
- **US-CRM-123-2**: Ca vânzător, vreau să deschid feed-ul de notificări, să văd titlul/descrierea și când a apărut fiecare.
- **US-CRM-123-3**: Ca vânzător, vreau să marchez notificările ca citite (individual sau toate deodată), ca să nu mai apară în badge.
- **US-CRM-123-4**: Ca sistem, vreau să creez notificări automat când: un task se apropie de scadență (cu 24h înainte), un lead e convertit, un lead nou intră în pipeline.

## Acceptance criteria

1. **Schema DB**: tabel `notifications` (`id`, `tenant_id`, `user_id`, `type` enum, `title`, `body`, `link`, `is_read`, `metadata` JSONB, `created_at`).
2. **Migration**: generată și commitată; `db:reset && db:seed` trece.
3. **API**:
   - `GET /api/notifications` — returnează primele 20 necitite + număr total unread.
   - `PATCH /api/notifications/:id/read` — marchează una ca citită.
   - `POST /api/notifications/read-all` — marchează toate ca citite.
   - `POST /api/notifications` (internal — nu expus direct, folosit de server triggers).
4. **Badge pe clopot** în AppShell header: număr necitite, dispare când = 0. Polling la 30s sau manual refetch.
5. **Feed dropdown**: dropdown cu lista de notificări, scroll, fiecare cu: icon tip, titlu, body truncat, timp relativ, dot unread.
6. **Marcare citit**: click pe notificare → `PATCH`, scoate dot-ul; „Marchează toate" → bulk read.
7. **Tip notificări**: `task_due` (task scadent în 24h), `lead_converted` (lead convertit), `lead_created` (lead nou din webform/Facebook), `system`.
8. **Auto-creare**: la `POST /api/leads` (lead nou) → creare notificare `lead_created` pentru `assigned_to` (sau toți cu rol manager/owner dacă neasignat). La `POST /api/leads/:id/convert` → notificare `lead_converted`.
9. **A11y**: buton clopot cu `aria-label`, badge cu `aria-live="polite"`, dropdown are `role="menu"`.
10. **Dark mode**: semantic tokens.
11. **Multi-tenant**: notificările sunt scoped la `tenant_id` + `user_id`.

## Files

### New
- `server/db/schema/notifications.ts` — tabel notifications + enum type
- `server/routes/notifications.ts` — GET/PATCH/POST routes
- `server/lib/createNotification.ts` — helper pentru server-side creation
- `src/lib/api/notifications.ts` — client API
- `src/components/app/NotificationBell.tsx` — bell icon + badge + dropdown
- `src/__tests__/crm/notifications.test.tsx` — unit tests

### Modified
- `server/db/schema/index.ts` — re-export notifications
- `server/app.ts` — mount `/api/notifications`
- `server/routes/leads.ts` — fire notification on create + convert
- `src/components/app/AppShell.tsx` — add NotificationBell to header
- `backlog/crm/TEST-SCENARIOS.md` — append CRM-123 scenarios

## Tests

- **T-CRM-123-1** `[blocant]` Given lead nou creat, Then se creează notificare `lead_created` pentru user-ul responsabil (sau owners/managers).
- **T-CRM-123-2** `[blocant]` Given notificare necitită, When deschid feed-ul și o citesc, Then `is_read=true` și badge-ul scade.
- **T-CRM-123-3** Given `GET /api/notifications` autenticat, Then 200 cu `{ items: [], unreadCount: 0 }`.
- **T-CRM-123-4** `[blocant]` Given „Marchează toate", Then `unreadCount = 0`.
- **T-CRM-123-5** Multi-tenant: notificările tenantului A nu sunt vizibile din tenantul B.

## Definition of Done

- [ ] Toate AC-urile implementate
- [ ] `npm run build && npm run typecheck && npm run lint && npm test` verzi
- [ ] Migration gate: `db:generate` fără uncommitted diff, `db:reset && db:seed` trece
- [ ] API smoke: login + GET /api/notifications → 200
- [ ] Reviewer APPROVED
- [ ] Persona reports salvate
- [ ] PR deschis; STATE.json + BACKLOG.md actualizate
