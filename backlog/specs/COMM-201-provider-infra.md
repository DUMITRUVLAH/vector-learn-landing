---
id: COMM-201
title: "Infra provideri mesagerie: stub email/SMS/WhatsApp + tabel messages + delivery status"
milestone: COMM
phase: "1 — Infra"
priority: P0
slug: provider-infra
depends_on: [CRM-108, CRM-109]
status: pending
---

# COMM-201 — Infra provideri mesagerie

## Goal

Fundația sistemului de comunicare: tabel `messages` care loghează fiecare mesaj trimis
(indiferent de canal), servicii provider stub pentru email/SMS/WhatsApp care pot fi
înlocuite cu integrări reale fără a schimba contractul apelant, și actualizare delivery status
(queued → sent → delivered/failed).

## In scope

- **Schema DB**: tabel `messages` cu coloane:
  `id, tenant_id, lead_id (nullable), student_id (nullable), direction, channel,
  to_address, body, subject, template_id (FK → message_templates), status,
  provider_message_id, error_message, sent_at, delivered_at, failed_at, created_at`
  - `status` enum: `queued | sent | delivered | failed`
  - `channel` enum: `email | sms | whatsapp`
  - `direction` enum: `outbound | inbound`
  - tenant_id + lead_id/student_id + FK-uri cu cascade corecte
- **Migration** `0008_comm201_messages.sql` — aplicată via drizzle-kit
- **Provider service** `server/services/messaging/` cu 3 stub-uri:
  - `EmailProvider.send(to, subject, body) → { messageId, status }` — stub logare în console
  - `SmsProvider.send(to, body) → { messageId, status }` — stub
  - `WhatsAppProvider.send(to, body) → { messageId, status }` — stub
  - Fiecare stub returnează `{ messageId: crypto.randomUUID(), status: 'sent' }`
- **MessagingService** `server/services/messaging/MessagingService.ts`:
  - `sendMessage(tenantId, payload: SendMessagePayload) → Message`
  - Verifică `consent_revoked_at` pe lead (dacă `leadId` furnizat) → aruncă `ConsentRevokedError`
  - Inserează row în `messages` cu status `queued`
  - Apelează provider stub corespunzător
  - Actualizează row cu `sent_at + status=sent` (sau `failed + error_message`)
  - Returnează row-ul final
- **API routes** `POST /api/messages/send` (auth required):
  - Body: `{ channel, to_address, body, subject?, template_id?, lead_id?, student_id? }`
  - Returnează 200 + row `messages`
  - 403 dacă consent revocat
- **`GET /api/messages`** — listă mesaje per tenant (filtrabil: `?lead_id=` sau `?student_id=`)
- **Unit tests** (vitest): MessagingService.ts — verifică consent block, verifică insert în DB mock

## Out of scope

- Integrare reală SendGrid/Twilio/Meta — stub-uri doar
- Inbox UI (COMM-203)
- Broadcast (COMM-204)
- Quiet hours / anti-spam cap (COMM-205)

## Data / API

### messages table (drizzle schema)
```ts
messages {
  id: uuid PK
  tenantId: uuid FK → tenants.id CASCADE
  leadId: uuid? FK → leads.id SET NULL
  studentId: uuid? FK → students.id SET NULL
  direction: enum(outbound, inbound)
  channel: enum(email, sms, whatsapp)
  toAddress: varchar(255) NOT NULL
  body: text NOT NULL
  subject: varchar(500)
  templateId: uuid? FK → message_templates.id SET NULL
  status: enum(queued, sent, delivered, failed) DEFAULT queued
  providerMessageId: varchar(200)
  errorMessage: varchar(1000)
  sentAt: timestamp?
  deliveredAt: timestamp?
  failedAt: timestamp?
  createdAt: timestamp DEFAULT NOW
}
```

### POST /api/messages/send
Request: `{ channel: "email"|"sms"|"whatsapp", to_address: string, body: string, subject?: string, template_id?: string, lead_id?: string, student_id?: string }`
Response 200: `{ message: MessageRow }`
Response 403: `{ error: "consent_revoked" }`

### GET /api/messages
Query params: `lead_id?`, `student_id?`, `channel?`, `limit?=50`
Response: `{ items: MessageRow[] }`

## Acceptance criteria

- [ ] Migration 0008 aplicată; `messages` tabel există în DB
- [ ] `POST /api/messages/send` returnează 200 + row cu `status=sent`
- [ ] `POST /api/messages/send` cu lead care are `consent_revoked_at` returnează 403
- [ ] `GET /api/messages?lead_id=X` returnează lista mesajelor leadului
- [ ] Provider stubs loghează în console (nu aruncă erori)
- [ ] MessagingService unit test verde (consent block + happy path)
- [ ] Zero `any`, strict TypeScript

## Tests

1. [blocant] POST /api/messages/send → 200, status=sent
2. [blocant] POST cu consent revocat → 403 consent_revoked
3. [blocant] GET /api/messages?lead_id= → array
4. [normal] MessagingService unit test — consent throws ConsentRevokedError

## DoD

- Build + typecheck + lint verde
- Migration discipline: 0008 committed, `db:generate` fără diff
- API smoke: POST /api/messages/send → 200
- Tests verzi
- Reviewer APPROVED
- Personas salvate
