---
id: COMM-203
title: "Inbox unificat /app/inbox — conversații threaded per contact"
milestone: COMM
phase: "3 — Inbox"
priority: P1
slug: inbox
depends_on: [COMM-201, COMM-202]
status: pending
---

# COMM-203 — Inbox unificat

## Goal

Pagina `/app/inbox` — un singur ecran unde recepționerul vede toate conversațiile
(inbound + outbound) sortate după activitate recentă, cu thread per contact (lead sau student),
și poate răspunde direct.

## In scope

- **Pagina `/app/inbox`** accesibilă din sidebar (nav icon Inbox)
- **Lista conversații** (panoul stâng, scrollabil):
  - Fiecare rând: avatar cu inițiale, nume contact, canal icon, preview ultimul mesaj, timestamp relativ, badge count mesaje necitite
  - Sortare: desc după `last_message_at` (computed din `messages`)
  - Filter bar: All / Email / SMS / WhatsApp
  - Search box: filtrare client-side după nume contact
- **Panoul dreapta — thread conversație**:
  - Mesaje afișate bubble-style (outbound=dreapta bg-primary/10, inbound=stânga bg-muted)
  - Header: nume contact, canal, link „Deschide cartonaș" → `/app/leads/:id`
  - Status badge per mesaj (sent, delivered, failed)
  - Formular reply la baza panoului: textarea + buton „Trimite" → `POST /api/messages/send`
  - Canal reply = canalul ultimului mesaj din thread
- **API `GET /api/messages/threads`** (nou endpoint în COMM-203):
  - Returnează conversații grupate per (lead_id sau student_id, channel)
  - Câmpuri: `contact_id, contact_type (lead|student), contact_name, channel, last_message_at, unread_count, last_message_preview`
  - Tenant-scoped, ordine desc `last_message_at`
- **Inbox badge** în sidebar: numărul conversațiilor cu `unread_count > 0`
- Dark mode, mobile responsive (lista colaps în drawer pe mobile)
- Keyboard navigabil (Enter pe rând deschide thread, Esc închide)

## Out of scope

- Integrare reală webhook inbound (mesaje inbound sunt inserate manual/via API extern)
- Asignare conversație la agent (COMM-205 sau iteration 2)
- Notificări push browser (US-COM-18 — iterație viitoare)

## Data / API

### GET /api/messages/threads
Response:
```json
{
  "threads": [
    {
      "contactId": "uuid",
      "contactType": "lead" | "student",
      "contactName": "Maria Popescu",
      "channel": "whatsapp",
      "lastMessageAt": "2026-05-30T10:00:00Z",
      "unreadCount": 2,
      "lastMessagePreview": "Bună ziua, am o..."
    }
  ]
}
```

### GET /api/messages/threads/:contactId/:channel
Response: `{ messages: MessageRow[], contact: { id, name, type } }`

## Acceptance criteria

- [ ] `/app/inbox` se randează cu lista de conversații
- [ ] Filter canal funcționează (Email/SMS/WhatsApp/All)
- [ ] Click pe conversație afișează thread în panoul drept
- [ ] Reply din inbox → POST /api/messages/send → mesaj apare în thread
- [ ] Badge count în sidebar (dacă există nav)
- [ ] Dark mode parity
- [ ] Mobile responsive: lista colaps în drawer

## Tests

1. [blocant] `/app/inbox` renderează fără crash
2. [blocant] Filter canal filtrează corect
3. [blocant] Thread se încarcă la click pe conversație
4. [normal] Reply trimite mesaj și îl afișează în thread
5. [normal] Inbox badge reflectă unread_count

## DoD

- Build + typecheck + lint verde
- Tests verzi
- Reviewer APPROVED
- Personas salvate
