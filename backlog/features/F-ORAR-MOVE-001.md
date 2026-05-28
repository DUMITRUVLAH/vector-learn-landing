---
id: F-ORAR-MOVE-001
title: Mutarea unei lecții (drag-drop sau API)
module: orar
status: specced
priority: P0
owner: backend-team
landing_demo: M1-001
---

# Goal

Permite managerului să mute o lecție programată dintr-un slot (zi+oră+sală) în altul, cu propagarea automată a tuturor consecințelor (plăți, notificări, calendar profesor, link videoconferință, salariu).

# Personas implicate

- **Manager academie / recepționer**: inițiază mutarea
- **Profesor**: primește notificare cu noul slot
- **Părinte / elev**: primește notificare WhatsApp/SMS/email
- **Sistem-auto**: rerunează validări, recalculează plăți, regenerează link Zoom

# Scenarii de utilizare

## Scenariul 1 — Mutare simplă, fără conflict

- **Trigger**: Manager apasă lung pe lecția "Engleză B2, joi 14:00" și o trage pe "vineri 16:00".
- **Pași sistem**:
  1. Verifică disponibilitatea profesorului la noua oră (calendar profesor + buffer 15 min)
  2. Verifică disponibilitatea sălii (sau permite "online" dacă lecția nu cere sală fizică)
  3. Salvează `lesson.previousSlot` pentru audit + posibil rollback
  4. Update `lesson.scheduledAt = vineri 16:00`
  5. Regenerează link Zoom/Meet/Teams (token vechi devine invalid)
  6. Generează notificări outbox: WhatsApp către părinte, push către profesor, email backup
  7. Recalculează `teacherPayroll.expectedPay` pentru luna respectivă (dacă lecția se mută între luni)
- **Output vizibil**: toast "Lecție mutată, 12 părinți notificați" în UI manager
- **Output invizibil**: 1 audit log entry, 2 webhook-uri către 1C și calendar Google Workspace

## Scenariul 2 — Mutare cu conflict de profesor

- **Trigger**: Manager încearcă mutarea pe slot unde profesorul are deja lecție
- **Pași sistem**:
  1. Detectare conflict înainte de salvare (validare server-side, nu doar client)
  2. Returnează `409 Conflict` cu `{ conflictType: "teacher_double_booked", conflictingLessonId, suggestion: [...] }`
  3. UI afișează modal cu 3 sugestii alternative (sloturi libere ±2h)
- **Output**: manager alege o sugestie sau anulează

## Scenariul 3 — Mutare cu conflict de sală

- Similar Scenariu 2, dar `conflictType: "room_double_booked"`. Sistemul propune săli alternative cu capacitate ≥.

## Scenariul 4 — Mutare în trecut (interzis)

- **Trigger**: Manager încearcă să mute o lecție din viitor în trecut.
- **Pași**: server returnează `400 Bad Request` cu `{ error: "cannot_move_to_past" }`. UI nu permite drop-ul.

## Scenariul 5 — Mutare bulk (toată grupa)

- **Trigger**: "Mută toate lecțiile Grupei 4 cu 1 săptămână mai târziu (vacanță)"
- **Pași**: tranzacție atomică pe N lecții. Dacă oricare are conflict, ofertă pe lot ("3/12 au conflict, le sărim?") cu confirmare explicită.

# Data model (preliminary)

```sql
CREATE TABLE lessons (
  id UUID PRIMARY KEY,
  group_id UUID REFERENCES groups(id),
  teacher_id UUID REFERENCES users(id),
  room_id UUID REFERENCES rooms(id) NULL, -- NULL = online
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 60,
  status ENUM('scheduled','completed','cancelled','rescheduled') DEFAULT 'scheduled',
  meeting_url TEXT NULL,
  meeting_provider ENUM('zoom','meet','teams','none') DEFAULT 'none',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE lesson_audit (
  id UUID PRIMARY KEY,
  lesson_id UUID REFERENCES lessons(id),
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ DEFAULT now(),
  previous_data JSONB,
  new_data JSONB,
  reason TEXT NULL
);

CREATE INDEX idx_lessons_teacher_time ON lessons (teacher_id, scheduled_at);
CREATE INDEX idx_lessons_room_time ON lessons (room_id, scheduled_at);
```

# API surface

```
PATCH /api/v1/lessons/:id
Body: {
  scheduled_at: "2026-05-30T16:00:00+03:00",
  room_id: "uuid" | null,
  reason?: string  // pentru audit
}

Response 200: { lesson: {...}, notifications: { sent: 14, failed: 0 } }
Response 409: { error, conflictType, conflictingLessonId, suggestions: [...] }
Response 400: { error, code }
```

```
POST /api/v1/lessons/bulk-move
Body: { groupId, deltaMinutes: 10080 }  // 1 săpt
Response: { moved: N, conflicts: [...] }
```

# Acceptance criteria

- [ ] Mutarea unei lecții fără conflict actualizează `scheduled_at` în DB
- [ ] Notificările sunt accodate în outbox în maxim 200ms de la PATCH OK
- [ ] WhatsApp & email se trimit asincron via job queue (BullMQ/Sidekiq)
- [ ] Conflict de profesor returnează 409 cu sugestii viable
- [ ] Linkul Zoom vechi e revocat în maxim 5 secunde
- [ ] Audit log conține before/after JSON
- [ ] `previousSlot` permite rollback cu un click în 24h

# Edge cases

- Mutare la o lecție cu prezență deja marcată: blochează cu mesaj "lecția are prezență, nu poate fi reprogramată"
- Mutare la o lecție anulată: idempotent (nu face nimic, returnează 200 cu warning)
- Mutare cu profesorul în concediu: validare împotriva `teacher_availability` table
- Mutare în timpul DST (ora se schimbă): folosește timestamps UTC în DB, conversie la TZ-ul filialei la display
- Mutare cu link Zoom personal vs. shared: doar cele "shared" se regenerează; cele personale rămân (manualitatea profesorului)

# Dependențe

- **Interne**: `teacher_availability`, `room_availability`, `payment_calculation`, `notifications_outbox`
- **Externe**: Zoom API (revocare + creare meeting), Google Calendar API (sync), WhatsApp Business API

# Risc & GDPR

- Notificările trimise conțin nume elev → log doar message_id, nu conținut
- Audit log păstrează pseudonime, nu PII complet după 90 zile (anonimizare automată)

# Out of scope (pentru F-ORAR-MOVE-001)

- Mutarea recurentă (toată sesiunea de 12 săptămâni) — separat în `F-ORAR-MOVE-002`
- Notificare avansată cu preferință elev pe canal — separat în `F-COMUNICARE-PREF-001`
- AI suggestion pentru slot optim — separat în `F-AI-SLOT-001`
