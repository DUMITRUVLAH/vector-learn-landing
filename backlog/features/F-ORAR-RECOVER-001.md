---
id: F-ORAR-RECOVER-001
title: Recuperare lecție absentă (elev)
module: orar
status: specced
priority: P0
owner: backend-team
landing_demo: M1-001
---

# Goal

Când un elev lipsește de la o lecție de grup, sistemul propune automat 3 sloturi alternative compatibile cu disponibilitatea elevului ȘI a profesorului, iar elevul/părintele își rezervă singur slot-ul.

# Personas implicate

- **Profesor**: marchează absența la finalul lecției
- **Părinte / elev**: primește link cu cele 3 sugestii și rezervă self-service
- **Manager**: opțional, vede cererile pending dacă elevul nu rezervă în 48h
- **Sistem-auto**: găsește sloturi, trimite notificări, ajustează plățile

# Scenarii

## Scenariul 1 — Absență simplă cu recuperare individuală

- **Trigger**: profesor apasă "Absent" pe Maria Popescu la lecția de joi 14:00
- **Pași**:
  1. Sistem caută în `teacher_availability` sloturi libere în următoarele 14 zile
  2. Intersectează cu `student_availability` (declarat la onboarding sau din istoricul de prezență)
  3. Filtrează sloturi cu altă lecție compatibilă (același nivel/disciplină)
  4. Returnează top 3 sugestii sortate după proximitate temporală
  5. Trimite WhatsApp către părinte: "Maria a lipsit joi. Iată 3 opțiuni: [link]"
  6. Linkul deschide o pagină self-service cu butoane "Rezervă"
  7. Click pe rezervare → API creează `recovery_lesson` legată de `lesson_attendance.absent_id`
  8. Confirmare instant + adăugare în calendar profesor + invitație Zoom

## Scenariul 2 — Niciun slot disponibil în 14 zile

- Sistem extinde căutarea la 21 zile
- Dacă tot nimic, escaladare automată către manager: "Nu am sloturi pentru Maria, sugerează manual"
- Părintele primește notificare: "Vom reveni cu opțiuni săptămâna viitoare"

## Scenariul 3 — Elevul nu rezervă în 48h

- Reminder WhatsApp la 24h: "Nu uita să-ți alegi recuperarea"
- La 48h, sistemul rezervă AUTOMAT prima sugestie + notifică părintele cu opțiune "Schimbă"
- Comportament configurabil per centru (auto vs. expire)

## Scenariul 4 — Recuperare de grup (mai mulți absenți)

- Dacă 3+ elevi din aceeași grupă au lipsit, sistemul propune recuperare de grup în loc de individuale
- Manager confirmă, sistem crează o lecție extra în calendar și notifică toți părinții implicați

## Scenariul 5 — Recuperare contează la plată

- Dacă elevul are pachet "10 lecții/lună", recuperarea NU se scade din pachet (era inclusă)
- Dacă e pe pachet "lecție individuală plătită", se aplică credit
- Sistemul afișează clar pe pagina părintelui: "Această recuperare nu costă extra"

# Data model

```sql
CREATE TABLE attendance (
  id UUID PRIMARY KEY,
  lesson_id UUID REFERENCES lessons(id),
  student_id UUID REFERENCES students(id),
  status ENUM('present','absent','late','excused'),
  marked_by UUID REFERENCES users(id),
  marked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lesson_id, student_id)
);

CREATE TABLE recovery_requests (
  id UUID PRIMARY KEY,
  attendance_id UUID REFERENCES attendance(id) UNIQUE,
  status ENUM('pending','reserved','expired','escalated','completed'),
  suggested_slots JSONB, -- [{lesson_id, score}, ...]
  reserved_slot_id UUID REFERENCES lessons(id) NULL,
  reserved_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  payment_credited BOOLEAN DEFAULT false
);
```

# API surface

```
POST /api/v1/lessons/:id/attendance
Body: { student_id, status, mark_absent_recovery?: boolean }
Response: { attendance_id, recovery_request_id?, suggestions?: [...] }
```

```
GET /api/v1/recovery/:token
Response: { suggestions: [...], student_info, expires_at }
(token e nelogat, valid 48h, unique per recovery_request)
```

```
POST /api/v1/recovery/:token/reserve
Body: { lesson_id }
Response: { reservation: {...} }
```

# Acceptance criteria

- [ ] Marcarea absenței creează automat un `recovery_request` cu 3 sugestii
- [ ] Părintele primește notificare în max 60 sec
- [ ] Linkul self-service funcționează fără login (token signed JWT, expirat 48h)
- [ ] Rezervarea creează lecție nouă cu link Zoom automat
- [ ] Plata e ajustată corect (credit dacă elev plătește per lecție)
- [ ] Escalation către manager dacă nimic în 21 zile
- [ ] Auto-reservation dacă elevul nu acționează în 48h (configurabil)

# Edge cases

- Elevul absent dintr-o lecție individuală (nu de grup): trial-eaza același flow, doar că "recovery" e tot lecție individuală
- Lecție în trecut îndepărtat: nu se mai poate marca absență după 7 zile
- Profesorul nu mai e disponibil deloc în 21 zile (concediu): sistem cere manual înlocuitor sau credit
- Conflictul cu o altă lecție a elevului: filtru automat

# Dependențe

- `student_availability` (introdus la onboarding sau dedus din istoric)
- `teacher_availability` 
- `notifications` (WhatsApp Business)
- `payment_credits` (pentru ajustare automată)

# Risc & GDPR

- Linkul self-service e public dar token-ul e signed, scurt (48h), revocat după rezervare
- Audit log: cine a marcat absența, cine a rezervat recuperarea, când

# Out of scope

- AI-based slot prediction (ex: "elevul preferă marți seara") — `F-AI-RECOVERY-001`
- Recuperare cu alt profesor decât cel original — `F-ORAR-RECOVER-002`
