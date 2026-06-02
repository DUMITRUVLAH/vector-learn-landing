---
id: INTEG-203
title: CX — course name real în export + link participant→student
milestone: INTEG
phase: "2"
branch: feat/INTEG-faza-2-ux-cross-module
status: pending
attempts: 0
depends_on: [INTEG-103]
---

## Goal

Două goluri de UX în modulul CX:
1. Export CSV cohortă folosește `selectedCohort.label` ca `courseName` în loc de `courses.name` real
2. Participanții care au un `studentId` nu au niciun link spre profilul lor din Students

## User stories

- Ca manager, când export o cohortă în CSV, vreau că coloana "Cursul" să afișeze numele real al cursului, nu eticheta cohortei, pentru că documentul trebuie să fie corect.
- Ca manager CX, când văd un participant care e și student în sistem, vreau să pot da click pe numele lui și să ajung la fișa lui din Students, pentru că nu renavighezi manual.

## Acceptance criteria

### 1. Course name real în export

- `src/pages/app/CXPage.tsx` — după încărcarea cohortelor, fetch-uiește cursurile distincte:
  ```ts
  const courseIds = [...new Set(cohorts.map(c => c.courseId).filter(Boolean))]
  // GET /api/courses?ids=uuid1,uuid2,...
  ```
- Construiește un map `courseId → courseName`
- La export CSV (linia ~99): `courseName: courseMap[selectedCohort.courseId] ?? selectedCohort.label`

### 2. Link participant→student

- `src/components/modules/cx/ParticipantTable.tsx`:
  - Când `participant.studentId !== null`, wrap name-ul în `<button>` sau `<a>` cu handler de navigație
  - La click: navighează la `/app/students` cu un parametru de highlight (ex: `?studentId=...`) SAU deschide un mini-popover cu datele de bază ale studentului
  - Implementare simplă: `onClick={() => window.location.hash = '#/app/students?studentId=' + participant.studentId}`
  - Iconița de link (extern) afișată lângă nume când `studentId` există

### 3. `GET /api/courses` suportă param `?ids=uuid1,uuid2`

- `server/routes/courses.ts` acceptă query param `ids` (CSV de UUID-uri)
- Returnează array de cursuri filtrate după acele ID-uri
- Necesar pentru fetch-ul batch din CXPage

## Files touched

- `src/pages/app/CXPage.tsx` — batch fetch cursuri + courseMap
- `src/components/modules/cx/ParticipantTable.tsx` — link student
- `server/routes/courses.ts` — param `?ids=` pentru batch fetch
- `src/lib/api/courses.ts` — actualizează `listCourses` să accepte `ids`

## Tests

- Unit: CXPage CSV export conține `courseName` din `courses.name`
- Unit: ParticipantTable afișează link când `studentId !== null`
- Unit: ParticipantTable nu afișează link când `studentId === null`
- Integration: `GET /api/courses?ids=uuid1,uuid2` returnează array filtrat

## DoD

- [ ] Export CSV cu course name real
- [ ] Link participant→student funcțional
- [ ] `GET /api/courses?ids=` suportat
- [ ] Tests verzi
- [ ] Nicio migrare necesară
