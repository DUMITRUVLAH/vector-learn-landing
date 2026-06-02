---
id: STU-201
title: "Student profile — full page (payments, attendance, lead origin, parent contact)"
milestone: STUDENTS
phase: 2
status: pending
depends_on: [COURSE-103, MVP-004, MVP-007, SCHED-503]
slug: student-profile-full
---

## Goal

Extinde `/app/students/:id` (creat în COURSE-103) cu 4 tab-uri suplimentare:
**Plăți**, **Lecții & Prezență**, **Contact Părinte**, și un badge "Lead origine" dacă
elevul a venit dintr-un lead CRM. Scopul: un manager/recepționer vede TOTUL despre un elev
pe un singur ecran, fără să sară între module.

**Reuse obligatoriu:**
- `StudentDetailPage.tsx` deja există (COURSE-103) cu tab-ul "Grupe". Adaugă tab-uri noi pe aceeași pagină.
- Pattern tabel paginat: refolosește pattern-ul din `StudentsPage.tsx` (fetch + tabel Tailwind).
- `payments` tabel: `server/db/schema/payments.ts` — există deja.
- `student_lessons` / `lessons` — `server/db/schema/lessons.ts` — există deja.
- Tenant-safety: toate query-urile filtrează pe `tenantId`.

## In scope

### Backend — noi endpoints

#### `GET /api/students/:id/payments`
- Returnează plățile unui elev: `id, amountCents, currency, status, paidAt, method, notes, createdAt`.
- Ordonat: `paidAt desc nulls last, createdAt desc`.
- Tenant-safe (400 dacă student nu aparține tenantului).

#### `GET /api/students/:id/lessons`
- Returnează lecțiile la care a participat: `id, scheduledAt, durationMin, subject, teacherName, attendanceStatus`.
- JOIN: `lessons` + `student_lessons` + `teachers` (pentru teacherName).
- Ordonat: `scheduledAt desc`.
- Limitat la ultimele 60 de lecții (performanță).

#### `GET /api/students/:id` (extensie)
- Asigură că returnează `parentName, parentEmail, parentPhone, notes, leadId` (dacă există).
- Dacă `leadId` e setat → include câmpul în răspuns.

### Frontend — extensie StudentDetailPage.tsx

#### Tab "Plăți"
- Tabel: Data, Sumă, Monedă, Status (badge colorat: verde=paid, galben=pending, roșu=overdue), Metodă, Note.
- Total plătit: rând de sumă în footer tabel (sumCents al status=paid).
- Stare goală: "Nicio plată înregistrată."

#### Tab "Lecții"
- Tabel: Data, Subiect, Profesor, Durată, Prezență (badge: ✓Prezent / ✗Absent / —Nemarcat).
- Filtru rapid: "Toate" | "Prezent" | "Absent".
- Stare goală: "Nicio lecție înregistrată."

#### Tab "Contact"
- Card cu: Nume elev, Dată naștere (dacă există), `parentName`, `parentEmail` (link mailto:), `parentPhone` (link tel:), `notes` (textarea editabilă cu auto-save la blur).
- Buton "Editează profil" → deschide drawer de editare existent.

#### Lead origine (badge în header, nu tab)
- Dacă studentul are `leadId` → badge "Lead #<shortId>" cu link la `/app/leads/<leadId>`.
- Dacă nu → nimic (nu afișa badge gol).

### Tests
- `src/__tests__/students/student-profile.test.ts` — unit + integration:
  - `GET /api/students/:id/payments` returnează plățile tenantului.
  - `GET /api/students/:id/lessons` returnează lecțiile cu attendanceStatus.
  - Alt tenant → 403/404.
- `src/pages/app/StudentDetailPage.test.tsx` — extins cu:
  - Render tab "Plăți" cu mock payments → tabel vizibil.
  - Render tab "Lecții" cu mock lessons → badge prezență vizibil.

## User stories
- Ca **Manager**, vreau să văd istoricul de plăți al unui elev pe profilul lui, pentru că nu vreau să deschid modulul de Finanțe separat.
- Ca **Recepționer**, vreau să văd la ce lecții a participat un elev și prezența lui, pentru că verific rapid dacă elevul a venit săptămâna trecută.
- Ca **Manager**, vreau să văd dacă elevul a venit dintr-un lead CRM, pentru că urmăresc conversia canalelor de marketing.
- Ca **Profesor**, vreau să văd datele de contact ale părintelui pe profilul elevului, pentru că comunic cu el despre progres.

## Acceptance criteria
- AC1: Tab "Plăți" afișează lista plăților unui elev cu suma, statusul și data.
- AC2: Tab "Lecții" afișează ultimele 60 de lecții cu statusul de prezență per lecție.
- AC3: Filtrul "Prezent/Absent" în tab-ul Lecții funcționează (filtrare client-side).
- AC4: Dacă studentul are `leadId`, badge-ul "Lead origine" apare în header cu link funcțional.
- AC5: Tab "Contact" permite editarea câmpului `notes` cu save la blur.
- AC6: Query-urile sunt tenant-safe (alt tenant → 403 sau 404).
- AC7: Stare goală afișată corespunzător pentru fiecare tab.
- AC8: Build+typecheck+lint curate; zero `any`.

## Tests (Given/When/Then)
- **T-STU-201-1** [blocant] Given serverul pornit + user autentificat, When `GET /api/students/:id/payments`, Then 200 + `{ items: [] }` pentru elev fără plăți (live API smoke).
- **T-STU-201-2** [blocant] Given student cu 2 plăți, When `GET /api/students/:id/payments`, Then 200 + 2 items cu `amountCents, status, paidAt`.
- **T-STU-201-3** [blocant] Given student cu lecții, When `GET /api/students/:id/lessons`, Then 200 + items cu `attendanceStatus`.
- **T-STU-201-4** [blocant] Given student din alt tenant, When request cu auth tenant A pentru student tenant B, Then 403 sau 404.
- **T-STU-201-5** [blocant] Given `<StudentDetailPage />` cu mock payments, When click tab "Plăți", Then tabelul afișează cele 2 plăți.
- **T-STU-201-6** [normal] Given student fără plăți, When click tab "Plăți", Then starea goală e vizibilă.
- **T-STU-201-7** [normal] Given student cu `leadId`, When render, Then badge-ul "Lead origine" e vizibil cu href corect.
- **T-STU-201-8** [blocant] Given build, When `npm run build`, Then zero erori TypeScript + ESLint.

## DoD
Build+typecheck+lint curate, unit + integration tests verzi, reviewer APPROVED după review→improve,
persona reports salvate, commit pe `feat/STUDENTS-faza-2-profile`.
