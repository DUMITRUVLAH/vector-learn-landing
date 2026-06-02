---
id: COURSE-201
title: "Editare și arhivare cursuri"
milestone: COURSE
phase: "2"
status: pending
depends_on: [COURSE-101]
slug: edit-archive
---

## Goal

Permite managerului să editeze prețul, descrierea și durata unui curs existent (PATCH /api/courses/:id),
și să arhiveze un curs care nu se mai oferă (status "archived"). Cursul arhivat dispare din dropdown-urile
de înrolare dar rămâne în istoricul lecțiilor și plăților.

**Reuse obligatoriu:**
- Pattern STU-204 pentru soft-delete (status "archived").
- Endpoint-urile existente în `server/routes/courses.ts`.

## In scope

### PATCH /api/courses/:id
- Body: `name?`, `price?`, `durationMinutes?`, `description?`, `maxStudents?`
- Tenant-safe. Return updated course.
- Validare Zod: name min 2, price non-negative, durationMinutes positive.

### DELETE /api/courses/:id (soft-delete → archived)
- Setează `status = "archived"` (dacă câmpul nu există, îl adaugă în schema).
- Nu șterge fizic (constraint: poate fi referit din lecții).
- Returnează `{ ok: true }`.

### Frontend — CoursesPage.tsx (dacă există) sau adaugă acțiuni
- Buton "Editează" pe fiecare curs → modal/drawer cu form.
- Buton "Arhivează" pe fiecare curs (confirmare dialog) → dispare din lista activă.
- Filtru "Arată arhivate" (toggle).
- Toast la succes.

### No new migrations needed
- Dacă schema `courses` nu are `status`, adaugă coloana cu migrare.
- Dacă deja există (din COURSE-101/102) → refolosește.

## User stories
- Ca **Manager**, vreau să editez prețul unui curs pentru că l-am greșit la introducere.
- Ca **Admin**, vreau să arhivez un curs vechi pentru că nu-l mai ofer dar am lecții anterioare referite.
- Ca **Manager**, vreau să văd doar cursurile active în dropdown-uri pentru că cele arhivate nu sunt relevante.
- Ca **Recepționer**, vreau un toggle "Arată arhivate" pentru că uneori am nevoie de contextul istoricului.

## Acceptance criteria
- AC1: PATCH /api/courses/:id returnează cursul actualizat cu noile valori.
- AC2: DELETE /api/courses/:id setează status="archived", returnează `{ ok: true }`.
- AC3: Lista cursurilor nu include cele archived (default). Toggle "Arată arhivate" le include.
- AC4: Tenant-safe — nu poți edita/arhiva cursul altui tenant.
- AC5: Build+typecheck+lint curate.

## Tests (Given/When/Then)
- **T-COURSE-201-1** [blocant] Given curs existent, When PATCH cu `{ price: 150 }`, Then răspuns 200 cu price=150.
- **T-COURSE-201-2** [blocant] Given curs existent, When DELETE /:id, Then status becomes "archived" + răspuns 200.
- **T-COURSE-201-3** [blocant] Given curs arhivat, When GET /api/courses (default), Then cursul arhivat nu apare.
- **T-COURSE-201-4** [blocant] Given user tenant B, When PATCH cursul tenant A, Then 403 sau 404.
- **T-COURSE-201-5** [normal] Given build, When `npm run build`, Then zero erori TypeScript.

## DoD
Build+typecheck+lint curate, tests verzi, reviewer APPROVED, persona reports salvate,
commit pe `feat/COURSE-faza-2-edit-archive`.
