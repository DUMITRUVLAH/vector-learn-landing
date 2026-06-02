---
id: STU-202
title: "Student notes — timeline cu autor (profesori, manageri)"
milestone: STUDENTS
phase: 2
status: pending
depends_on: [STU-201]
slug: student-notes-timeline
---

## Goal

Un **timeline de note interne** pe profilul elevului, accesibil profesorilor și managerilor.
Fiecare notă are: body text, autor (userul care a scris), timestamp, și opțional tipul
(„notă generală" / „observație pedagogică" / „comunicare cu părintele").

Notele sunt interne (nu le vede părintele prin portalul public). Utile pentru:
- Profesori: „Are dificultate cu past perfect - necesită repetare"
- Manageri: „Mama a sunat, solicită recuperare"
- Recepție: „A achitat cash, fără chitanță — verificat cu Andreea"

**Reuse obligatoriu:**
- Pattern `leadInteractions` din CRM (tabel existent) este REFERINȚA, dar nu refolosi direct
  deoarece notele de elev sunt un domeniu separat. Creează `student_notes` (tabel nou).
- Pattern API: `POST /api/leads/:id/interactions` → adaptează la `POST /api/students/:id/notes`.
- UI Timeline: refolosește pattern-ul din `LeadCard.tsx` timeline (list de interacțiuni cu badge
  autor). Zero reimplementări custom.

## In scope

### Schema `server/db/schema/studentNotes.ts`
- `student_notes`:
  - `id` uuid PK default gen_random_uuid()
  - `tenantId` uuid FK → tenants (cascade delete)
  - `studentId` uuid FK → students (cascade delete)
  - `authorId` uuid FK → users nullable (dacă userul e șters, nota rămâne)
  - `authorName` varchar(255) — denormalizat la scriere (nu depinde de JOIN)
  - `body` text NOT NULL
  - `noteType` varchar(32) default 'general' — enum soft: `general|pedagogical|parent_comm`
  - `createdAt` timestamp default now()
  - `updatedAt` timestamp default now()
- Index: `(tenantId, studentId, createdAt desc)`.
- Export în `server/db/schema/index.ts`.

### Migrare
- `drizzle/0034_stu202_student_notes.sql` (prefix 34 = max 33 + 1).
- Enum `note_type` ca VARCHAR soft (nu Postgres enum) — evită migrările de ALTER TYPE.

### API `server/routes/students.ts` (extins)
- `POST /api/students/:id/notes` body `{ body: string, noteType?: string }`:
  - Validează student aparține tenantului.
  - Ia `authorId` + `authorName` din session (`req.user`).
  - Inserează `student_notes`. Returnează nota creată.
- `GET /api/students/:id/notes`:
  - Returnează notele elevului ordonate `createdAt desc`.
  - Tenant-safe.
  - Paginare simplă: `limit=50` implicit.
- `DELETE /api/students/:id/notes/:noteId`:
  - Poate șterge doar autorul notei SAU un admin (rol `admin`/`manager`).
  - Returnează `{ ok: true }`.

### Frontend

#### Tab "Note" în StudentDetailPage.tsx
- Lista notelor în ordine cronologică inversă.
- Fiecare notă: avatar/inițiale autor, `authorName`, timestamp formatat (ro-RO), badge tip notă, body text.
- Textarea la baza listei: placeholder "Adaugă o notă internă..." + buton "Adaugă".
- Submit: `POST /api/students/:id/notes`, optimistic update (adaugă nota în UI imediat).
- Ștergere (buton X pe nota proprie sau dacă admin): confirm inline „Ștergi nota?".
- Stare goală: "Nicio notă. Adaugă prima notă despre elev."

### `src/__tests__/students/student-notes.test.ts`
- POST /api/students/:id/notes creează nota cu authorName corect.
- GET /api/students/:id/notes returnează notele în ordine desc.
- DELETE — autorul poate șterge propria notă; altul nu poate (403).
- Alt tenant → 403/404.

### `src/pages/app/StudentDetailPage.test.tsx` (extins)
- Render tab "Note" → textarea vizibilă.
- Submit nota → nota apare în lista de sus (mock optimistic).

## User stories
- Ca **Profesor**, vreau să las o notă pe profilul elevului cu observații pedagogice, pentru că următorul profesor sau managerul să știe contextul.
- Ca **Manager**, vreau să văd toate notele despre un elev (de la toți profesorii), pentru că înțeleg situația completă înainte de o discuție cu părintele.
- Ca **Recepționer**, vreau să pot adăuga o notă de tip "comunicare cu părintele", pentru că documentez orice interacțiune importantă.
- Ca **Profesor**, vreau să pot șterge propria notă greșită, pentru că mențin calitatea informațiilor.

## Acceptance criteria
- AC1: `POST /api/students/:id/notes` creează o notă cu `authorName` din sesiunea curentă.
- AC2: `GET /api/students/:id/notes` returnează notele ordonate `createdAt desc`.
- AC3: Un profesor nu poate șterge nota altui profesor (403).
- AC4: Un admin/manager poate șterge orice notă a tenantului.
- AC5: Tab "Note" în UI afișează notele cu autor, timestamp și tip.
- AC6: Adăugare notă în UI: optimistic update (nota apare imediat fără reload).
- AC7: Migrarea e idempotentă (`db:reset && db:seed` succes); prefix 34.
- AC8: Tenant-safe pe toate rutele.

## Tests (Given/When/Then)
- **T-STU-202-1** [blocant] Given serverul pornit + user autentificat, When `POST /api/students/:id/notes` cu body valid, Then 201 + nota cu `authorName` = name-ul din session (live API smoke).
- **T-STU-202-2** [blocant] Given schema `student_notes`, When `db:generate`, Then NU rămâne migrare necommitted; prefix 34.
- **T-STU-202-3** [blocant] Given nota creată de profesorul A, When profesorul B trimite `DELETE`, Then 403.
- **T-STU-202-4** [blocant] Given nota creată de profesorul A, When admin trimite `DELETE`, Then 200 `{ ok: true }`.
- **T-STU-202-5** [blocant] Given alt tenant, When `GET /api/students/:id/notes`, Then 403 sau 404.
- **T-STU-202-6** [blocant] Given `<StudentDetailPage />` cu tab "Note" și mock note list, When render, Then 2 note vizibile cu `authorName`.
- **T-STU-202-7** [normal] Given textarea goală, When submit fără body, Then butonul "Adaugă" e disabled.
- **T-STU-202-8** [blocant] Given `db:reset && db:seed`, Then succes (idempotență migrare).

## DoD
Build+typecheck+lint curate, migrare committed + idempotentă, API smoke verde, unit+integration verzi,
reviewer APPROVED, persona reports salvate, commit pe `feat/STUDENTS-faza-2-profile`.
