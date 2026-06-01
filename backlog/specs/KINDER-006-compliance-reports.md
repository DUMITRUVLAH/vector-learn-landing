---
id: KINDER-006
title: Licensing/compliance reports — ratio history, immunization status, subsidy attendance
milestone: KINDER
phase: "1"
branch: feat/KINDER-faza-1-checkin-diary-ratio
status: pending
attempts: 0
depends_on: [KINDER-001, KINDER-003, KINDER-004]
---

## Goal

Grădinițele sunt supuse inspecțiilor anuale și trebuie să prezinte rapoarte doveditoare
pentru trei arii: (1) respectarea raportului legal personal/copii (din KINDER-003), (2) statusul
vaccinărilor (din KINDER-004), și (3) prezența zilnică pentru programele de subvenție (subsidy
attendance — statul plătește per zi de prezență verificabilă). Adăugăm o pagină "Rapoarte
de licențiere" cu trei secțiuni, filtre de interval de date, și export CSV/PDF.

## User stories

- Ca manager de grădiniță, vreau să generez un raport lunar al raportului personal/copii pentru fiecare zi, pentru că inspectoratul îl poate cere oricând.
- Ca manager, vreau un raport de status vaccinare exportabil, pentru că la reînnoire licenței trebuie să dovedesc că > 95% copii au vaccinurile la zi.
- Ca contabil, vreau un raport de prezență pe luni pentru programul de subvenție, pentru că statul plătește per copil per zi prezent și trebuie să trimit documentele până pe 10 ale lunii.
- Ca inspector, vreau să văd un rezumat clar al conformității grădiniței, pentru că nu pot verifica sute de fișe manual.

## Acceptance criteria

1. API `GET /api/kinder/compliance/ratio-history?from=YYYY-MM-DD&to=YYYY-MM-DD` — returnează
   istoricul raportului personal/copii pe zile: `{ date, presentChildren, staffCount, ratioOk: boolean }`.
   Date sunt computate din `checkin_log` (copii prezenți) și `ratio_limits` (limit per staff).

2. API `GET /api/kinder/compliance/attendance-summary?from=YYYY-MM-DD&to=YYYY-MM-DD` — returnează
   un tabel per elev cu numărul de zile prezent în interval: `{ studentId, fullName, daysPresent, daysInRange }`.
   Util pentru rapoartele de subvenție (statul plătește per zi prezent).

3. API `GET /api/kinder/compliance/immunization-overview` — re-exportă date din KINDER-004 dar
   în format de raport formal: `{ totalStudents, fullyVaccinated, overdue, dueSoon, noRecord, complianceRate }`.

4. UI `KinderCompliancePage` (`/app/kinder/compliance`):
   - Trei carduri de sumar în header (ratio ok %, imunizare ok %, prezență medie).
   - Tab "Raport raport personal/copii": tabel cu o linie per zi, coloana Dată, Copii prezenți, Personal, Raport, Status (verde/roșu).
   - Tab "Prezență subvenție": tabel elev × zile prezente, total și % din interval.
   - Tab "Vaccinuri (sumar)": card simplu cu statistici agregate (n total, n conformi, n la risc).
   - Date picker pentru "De la" și "Până la" (implicit ultima lună).
   - Buton "Export CSV" pentru fiecare tab.

5. Route `/app/kinder/compliance` adăugat în `App.tsx`.

6. Link "Conformitate" adăugat în sidebar.

7. Fără migrări noi (toate datele provin din tabele deja existente: `checkin_log`, `ratio_limits`, `immunization_records`, `students`).

8. Test: `KinderCompliancePage` se renderizează fără crash. API `GET /api/kinder/compliance/attendance-summary` returnează 200 cu array de elevi.

## Files

### New
- `server/routes/kinderCompliance.ts` — compliance report endpoints
- `src/pages/app/KinderCompliancePage.tsx` — compliance report UI
- `src/__tests__/kinder-compliance.test.tsx` — unit tests

### Modified
- `server/app.ts` — mount kinderCompliance routes
- `src/App.tsx` — add route `/app/kinder/compliance`
- `src/lib/api/kinder.ts` — add compliance API helpers
- `src/components/app/AppShell.tsx` — add sidebar link

## Tests

- **T-KINDER-006-1** [blocant] Given the app is running, When GET /api/kinder/compliance/attendance-summary with auth, Then returns 200 with array.
- **T-KINDER-006-2** [blocant] KinderCompliancePage renders without crash.
- **T-KINDER-006-3** [normal] Given 5 students with various check-in history, When GET /api/kinder/compliance/attendance-summary?from=X&to=Y, Then each student has daysPresent between 0 and daysInRange.
- **T-KINDER-006-4** [normal] GET /api/kinder/compliance/immunization-overview returns complianceRate as a number 0-100.
- **T-KINDER-006-5** [normal] GET /api/kinder/compliance/ratio-history returns array sorted by date.

## DoD

- [ ] No new migrations needed
- [ ] Build + typecheck + lint green
- [ ] Unit tests green
- [ ] Reviewer APPROVED
- [ ] PR on `feat/KINDER-faza-1-checkin-diary-ratio`
