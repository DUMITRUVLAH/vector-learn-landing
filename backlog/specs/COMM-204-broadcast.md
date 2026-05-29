---
id: COMM-204
title: "Broadcast cu segmentare — trimitere mesaj în masă per segment"
milestone: COMM
phase: "4 — Broadcast"
priority: P0
slug: broadcast
depends_on: [COMM-201, COMM-202]
status: pending
---

# COMM-204 — Broadcast cu segmentare

## Goal

Permite trimiterea unui mesaj în masă (broadcast) către un segment de leads sau studenți
(filtrați după curs, status, tag), cu preview număr destinatari, template pre-completare,
și trimitere batch cu rate-limit simplu.

## In scope

- **Pagina `/app/broadcasts`** + link din sidebar (sau sub „Comunicare")
- **Formular Broadcast nou**:
  - Câmp Nume campanie (varchar 200)
  - Select Canal: Email / SMS / WhatsApp
  - Select Segment:
    - Tip segment: `leads` sau `students`
    - Filtru curs/interes (optional): dropdown cursuri din `GET /api/courses`
    - Filtru status: pt leads = stage; pt students = status (active/trial/paused)
    - Filtru tag (optional, COMM-201/CRM-115 tags)
  - Preview destinatari: afișează count + primele 5 nume; actualizat la schimbare filtru
  - Selectare template (opțional): refolosește CRM-108; pre-completare body cu variabile
  - Body editabil
  - Buton „Trimite acum" (sau „Planifică" — planificare out of scope)
- **Backend `POST /api/broadcasts`**:
  - Body: `{ name, channel, segment: { type, course_filter?, status_filter?, tag_filter? }, template_id?, body, subject? }`
  - Inserează row în `broadcasts` tabel (nou în migrare 0009)
  - Rezolvă destinatari (query DB cu filtrele)
  - **Verifică consent** per destinatar: sare peste leads cu `consent_revoked_at` (loghează count)
  - Înserează câte un row în `messages` per destinatar (status=queued)
  - Apelează MessagingService.sendMessage pentru fiecare (batch, max 10/sec stub)
  - Returnează `{ broadcast_id, total_recipients, consent_skipped, queued }`
- **`GET /api/broadcasts`** — lista campaniilor per tenant (id, name, channel, status, total, sent_at)
- **`GET /api/broadcasts/:id/messages`** — mesajele individuale ale campaniei (cu status)
- **Schema DB** `broadcasts` tabel:
  `id, tenant_id, name, channel, segment_filter (jsonb), template_id?, body, subject?, total_recipients, consent_skipped, status (draft|sending|done|failed), sent_at, created_at`
- **Migrare** `0009_comm204_broadcasts.sql`

## Out of scope

- Planificare (schedule) pentru viitor
- A/B test (US-COM-15 — P2)
- Calendar campanii (US-COM-16)
- Delivery analytics detaliat (iterație 2)

## Data / API

### POST /api/broadcasts
Request:
```json
{
  "name": "Anunț orar septembrie",
  "channel": "whatsapp",
  "segment": { "type": "students", "status_filter": "active", "course_filter": "uuid?" },
  "template_id": "uuid?",
  "body": "Bună {{first_name}}, ...",
  "subject": null
}
```
Response 200:
```json
{ "broadcastId": "uuid", "totalRecipients": 45, "consentSkipped": 2, "queued": 43 }
```

### GET /api/broadcasts/preview-count
Query: `?type=leads&status_filter=new&channel=whatsapp`
Response: `{ count: 23, sample: ["Maria P.", "Ion G.", ...] }`

## Acceptance criteria

- [ ] Formular broadcast cu segment selector funcțional
- [ ] Preview count actualizat dinamic (debounced)
- [ ] Submit → POST /api/broadcasts → toast cu nr destinatari + consent_skipped
- [ ] Destinatari cu consent_revoked_at săriti (nu primesc mesaj)
- [ ] Lista campaniilor vizibilă cu status
- [ ] Migrare 0009 commitată
- [ ] Dark mode, mobile responsive

## Tests

1. [blocant] POST /api/broadcasts → 200, returnează totalRecipients + consentSkipped
2. [blocant] Lead cu consent_revoked_at nu primește mesaj (consentSkipped > 0)
3. [blocant] GET /api/broadcasts → array cu campanii
4. [normal] Preview count endpoint returnează count corect
5. [normal] Formular UI: select segment → preview se actualizează

## DoD

- Build + typecheck + lint verde
- Migration discipline: 0009 committed
- API smoke: POST /api/broadcasts → 200
- Tests verzi
- Reviewer APPROVED
- Personas salvate
