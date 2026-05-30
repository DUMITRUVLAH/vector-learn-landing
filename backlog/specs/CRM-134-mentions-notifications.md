---
id: CRM-134
title: "@mentions in note-uri + notificare utilizator menționat"
milestone: CRM
phase: I
status: pending
depends_on: [CRM-131, CRM-132]
slug: mentions-notifications
---

## Goal

Permite colegilor să se menționeze în note cu `@NumeUtilizator`. La salvarea notei,
utilizatorul(ii) menționat(i) primesc o notificare in-app (badge + clopoțel în navbar).
Refolosește schema `notification_queue` din COMM-205 (adaugă `mention` ca tip nou).

---

## In scope

- **UI — textarea note** (în `LeadCardPage.tsx` și tab Activity): dacă utilizatorul scrie `@` urmat
  de litere, apare un popover cu lista utilizatorilor din același tenant (maxim 8, filtrat live).
  La selectare: textul `@Prenume Nume` e inserat, popover-ul se închide.
- **Parsare mențiuni** la submit: regex `/@([a-zA-ZÀ-ž]+ [a-zA-ZÀ-ž]+)/g` sau `/@([a-zA-ZÀ-ž]+)/g`
  pe body-ul notei; rezolvate la `users` din același tenant.
- **Backend — `POST /api/leads/:id/interactions`** (extinde ruta existentă):
  după salvarea interacțiunii de tip `note`, pentru fiecare utilizator menționat unic:
  - inserează un `lead_mention` (tabelă nouă, migrare CRM-134);
  - inserează în `notification_queue` o notificare `channel='in_app'` cu payload
    `{ body: "Ai fost menționat de <autor> în nota despre <fullName>", lead_id, interaction_id }`.
- **Schema nouă** — `lead_mentions`:
  ```
  id uuid PK
  tenant_id uuid FK tenants
  lead_id uuid FK leads
  interaction_id uuid FK lead_interactions
  mentioned_user_id uuid FK users
  created_at timestamptz
  ```
- **`GET /api/users/tenant-members`** — returnează `{ id, name }[]` ai tuturor
  utilizatorilor din tenant (pentru popover autocomplete). Auth required.
- **Bell / badge in-app**: `NotificationBell` component în `AppShell` navbar.
  `GET /api/notifications/unread-count` → `{ count: N }` (filtrează `notification_queue`
  unde `channel='in_app'` AND `sent_at IS NULL` AND `recipient_type='user'` AND
  `recipient_id = currentUserId`).
  Badge apare dacă `count > 0`. Click deschide un dropdown cu ultimele 10 notificări.
  `PATCH /api/notifications/mark-read` marchează toate ca `sent_at = now()`.
- Mențiunile sunt evidențiate cu `text-primary font-semibold` în timeline (la randare).

## Out of scope

- Email/SMS/WhatsApp pentru mențiuni
- Notificări push (browser Notifications API)
- Mențiuni în task-uri sau alte entități (doar în note de tip `note` pe lead)
- Audit log pentru notificări

---

## User stories

- **CA Andreea (manager)**: Când colegul X lasă o notă și mă menționează, văd un badge roșu
  pe clopoțel și pot naviga direct la lead-ul respectiv cu un click.
- **Coleg CRM**: Când scriu `@Ana M` în notă, un popover apare imediat cu lista membrilor
  echipei, aleg persoana, textul e inserat și la salvare Ana primește notificarea.

---

## Acceptance criteria

- [ ] Textarea notă: tastând `@` + 1 char → popover cu utilizatorii tenant, filtrare live.
- [ ] Selectarea unui utilizator din popover inserează `@Prenume Nume` în textarea și închide popover.
- [ ] Submit notă cu mențiune valabilă → în `lead_mentions` apare un rând nou.
- [ ] Submit notă cu mențiune → în `notification_queue` apare o intrare `channel='in_app'`.
- [ ] `GET /api/users/tenant-members` returnează lista utilizatorilor din tenant (fără parole).
- [ ] `GET /api/notifications/unread-count` returnează `{ count: N }` corect.
- [ ] `PATCH /api/notifications/mark-read` setează `sent_at = now()` pe toate notificările unread ale utilizatorului curent.
- [ ] `NotificationBell` apare în navbar; badge roșu când `count > 0`.
- [ ] Click pe bell → dropdown cu ultimele 10; click pe o intrare → navighează la lead.
- [ ] Click „Marchează toate ca citite" → badge dispare.
- [ ] Mențiunile în timeline sunt randate cu stil `text-primary font-semibold`.
- [ ] Migrare `lead_mentions` commitată; `db:reset + db:seed` succed.
- [ ] Multi-tenant: utilizatorul B nu poate vedea notificările tenantului A.
- [ ] 0 violări axe critical/serious; dark mode OK.
- [ ] TypeScript strict; zero `any`.

---

## Files

### Nou
- `server/db/schema/mentions.ts` — tabelă `lead_mentions`
- `drizzle/0016_crm134_lead_mentions.sql` — migrare
- `server/routes/users.ts` — `GET /api/users/tenant-members`
- `server/routes/notifications.ts` — `GET /api/notifications/unread-count`, `PATCH /api/notifications/mark-read`
- `src/components/crm/MentionTextarea.tsx` — textarea cu popover autocomplete
- `src/components/NotificationBell.tsx` — clopoțel cu badge + dropdown
- `src/lib/api/notifications.ts` — fetch helpers

### Modificat
- `server/db/schema/index.ts` — export `lead_mentions`
- `server/routes/leads.ts` — parsare mențiuni + insert în `lead_mentions` + `notification_queue` la POST interaction
- `server/index.ts` — mount `/api/users` și `/api/notifications`
- `src/components/crm/AppShell.tsx` (sau echivalentul navbarului) — adaugă `<NotificationBell />`
- `src/pages/app/LeadCardPage.tsx` — înlocuiește textarea simplă cu `<MentionTextarea />`
- `backlog/crm/TEST-SCENARIOS.md` — adaugă scenariile CRM-134

---

## Tests (Given/When/Then)

- **T-CRM-134-1** `[blocant]` Given `MentionTextarea` randat cu lista `[{id:'u1', name:'Ana Moraru'}]`, When tastez `@Ana`, Then popover vizibil cu opțiunea „Ana Moraru".
- **T-CRM-134-2** `[blocant]` Given popover deschis, When click pe „Ana Moraru", Then textarea conține `@Ana Moraru` și popover-ul e închis.
- **T-CRM-134-3** `[blocant]` Given `parseMentions('@Ana Moraru text', [{id:'u1',name:'Ana Moraru'}])`, Then returnează `['u1']`.
- **T-CRM-134-4** `[blocant]` Given `POST /api/leads/:id/interactions` cu body `"@Ana Moraru nota"` și Ana e în tenant, Then `lead_mentions` are 1 rând nou cu `mentioned_user_id = u1`.
- **T-CRM-134-5** `[blocant]` Given aceeași cerere, Then `notification_queue` are 1 rând nou cu `channel='in_app'` și `recipient_id = u1`.
- **T-CRM-134-6** `[blocant]` Given `GET /api/notifications/unread-count` cu 2 notificări unread, Then `{ count: 2 }`.
- **T-CRM-134-7** `[blocant]` Given `PATCH /api/notifications/mark-read`, Then toate notificările unread ale utilizatorului curent au `sent_at` setat.
- **T-CRM-134-8** `[blocant]` Given `NotificationBell` cu `count=3`, Then badge cu textul „3" vizibil.
- **T-CRM-134-9** Given `NotificationBell` cu `count=0`, Then badge nu e vizibil.
- **T-CRM-134-10** `[blocant]` Multi-tenant: `GET /api/notifications/unread-count` cu token tenant B returnează 0 chiar dacă există notificări în tenant A.

---

## DoD (Definition of Done)

- [ ] Toate acceptance criteria bifate.
- [ ] Toate scenariile `[blocant]` verzi.
- [ ] Migrare commitată (nu e în state `pending` din `drizzle` — `db:generate` nu lasă diff).
- [ ] `npm run build && npm run typecheck && npm run lint && npm test` verde.
- [ ] PR deschis pe `preview/sched-all` cu body structurat.
