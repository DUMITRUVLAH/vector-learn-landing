---
id: STU-205
title: "Detectare duplicate la crearea elevului (live phone/name check)"
milestone: STUDENTS
phase: 2
status: pending
depends_on: [STU-204]
slug: duplicate-detection-create
---

## Goal

Când recepționerul introduce telefon sau nume complet în formularul de creare elev, sistemul
verifică live (debounce 400ms) dacă există deja un elev cu acel telefon normalizat sau un nume
similar. Dacă există → afișează un banner "Există deja: <Nume> (<telefon>). Folosești profilul existent?"
cu link la profilul existent — exact ca detectarea de duplicate din CRM-102 (leads).

**Reuse obligatoriu:**
- `normalizePhone`/`normalizeEmail` din `server/lib/normalize.ts`.
- Pattern CRM-133 (duplicate-detection-banner) — adaptează la studenți.
- Endpoint check: `GET /api/students/check-duplicate` — nou, simplu.

## In scope

### `GET /api/students/check-duplicate`
- Query params: `phone?` (string) SAU `fullName?` (string) — măcar unul prezent.
- `phone` → normalizează + caută `phoneNormalized` exact (iute, indexat).
- `fullName` → caută ILIKE `%fullName%` (fuzzy, limitat la primele 5 rezultate).
- Returnează `{ matches: [{ id, fullName, phone, email, status }] }` — max 5 rezultate.
- 200 cu `matches: []` dacă nu există. Tenant-safe.

### Frontend — extensie drawer creare elev în `StudentsPage.tsx`

- Pe câmpul `phone` (onChange cu debounce 400ms): dacă ≥10 caractere → `GET /api/students/check-duplicate?phone=<val>`.
- Pe câmpul `fullName` (onChange cu debounce 400ms): dacă ≥5 caractere → `GET /api/students/check-duplicate?fullName=<val>`.
- Dacă `matches.length > 0`:
  - Banner galben sub câmpul respectiv: "Posibil duplicat: <Nume> (<telefon>)".
  - Link "Deschide profilul existent" → `/app/students/:id` (nou tab).
  - Buton "Continuă oricum" → dismisses banner, permite crearea.
- Dacă `matches = []`: nimic (nu distrage).
- Banner dispare la schimbarea valorii în câmp.

### Tests
- `src/__tests__/students/duplicate-check.test.ts`:
  - GET cu phone existent → `{ matches: [{ id, fullName }] }`.
  - GET cu phone inexistent → `{ matches: [] }`.
  - GET cu fullName parțial → max 5 rezultate ILIKE.
  - Alt tenant → 0 rezultate (nu leak cross-tenant).
- `src/components/app/AddStudentDrawer.test.tsx` (sau `StudentsPage.test.tsx`):
  - Banner apare la match.
  - Banner dispare la dismiss.

## User stories
- Ca **Recepționer**, vreau ca sistemul să-mi arate că elevul există deja când introduc numărul lui de telefon, pentru că nu creez duplicate accidentale.
- Ca **Manager**, vreau ca detecția să funcționeze și după nume (fuzzy), pentru că uneori recepționistele nu au telefonul la îndemână.

## Acceptance criteria
- AC1: `GET /api/students/check-duplicate?phone=<p>` returnează matches pe `phoneNormalized` exact.
- AC2: `GET /api/students/check-duplicate?fullName=<n>` returnează max 5 results ILIKE.
- AC3: Cross-tenant: un tenant nu vede elevii altuia (răspuns cu `matches: []`).
- AC4: UI: banner galben la match cu link la profilul existent.
- AC5: UI: "Continuă oricum" dismisses banner și permite crearea.
- AC6: Build+typecheck+lint curate.

## Tests (Given/When/Then)
- **T-STU-205-1** [blocant] Given elev cu phone "+40700000001", When `GET /api/students/check-duplicate?phone=0700000001`, Then matches cu elevul găsit (normalizare corectă).
- **T-STU-205-2** [blocant] Given phone inexistent, When check-duplicate, Then `{ matches: [] }`.
- **T-STU-205-3** [blocant] Given elev tenant A, When auth tenant B check-duplicate cu același phone, Then `{ matches: [] }` (izolare tenant).
- **T-STU-205-4** [blocant] Given serverul pornit + user autentificat, When `GET /api/students/check-duplicate?phone=test`, Then 200 (live API smoke).
- **T-STU-205-5** [blocant] Given drawer creare elev cu mock match, When render cu match, Then banner galben vizibil cu linkul la profil.
- **T-STU-205-6** [normal] Given banner vizibil, When click "Continuă oricum", Then banner dispare.
- **T-STU-205-7** [blocant] Given build, When `npm run build`, Then zero erori TypeScript.

## DoD
Build+typecheck+lint curate, tests verzi, reviewer APPROVED, persona reports salvate,
commit pe `feat/STUDENTS-faza-2-profile`. Acesta e ultimul item din faza 2 → deschide PR.
