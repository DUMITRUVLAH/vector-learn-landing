---
id: GAP-009
title: Lecție Recuperare (make-up)
milestone: GAP
phase: 1
priority: HIGH
status: pending
dependencies: [SCHED-503, lessons, lessonSeries, availability, GAP-006]
feeds_into: [GAP-010, GAP-017]
branch: feat/GAP-faza-1-trial-flow
---

## Scop

La absența unui elev, sistemul creează automat o cerere de recuperare cu sloturi sugerate. Tutorele alege din portal sau prin link fără login. Diferențiator cheie față de Excel/Google Sheets.

## User stories

- Ca profesor, când marchez un elev absent, vreau ca sistemul să trimită automat opțiuni de recuperare.
- Ca tutore, vreau să primesc un link și să aleg un slot de recuperare fără să mă loghez.

## Criterii de acceptare

- [ ] Tabel `recovery_requests`: `id uuid PK`, `tenantId uuid FK`, `studentLessonId uuid FK UNIQUE → student_lessons`, `status enum('pending','reserved','expired','completed') default 'pending'`, `suggestedSlots jsonb` (array de `{ lessonId, date, time, teacherName }`), `reservedLessonId uuid FK null → lessons`, `token varchar UNIQUE` (JWT scurt), `expiresAt timestamp`, `createdAt`, `updatedAt`
- [ ] La `PATCH .../attendance` cu `status: 'absent'`, sistemul caută lecții disponibile (același profesor, disciplină, nivel, în 14 zile) și creează `recovery_request` cu max 3 sloturi populate în `suggestedSlots`
- [ ] `GET /api/recovery/:token` — accesibil fără autentificare, returnează sloturi disponibile
- [ ] `POST /api/recovery/:token/reserve` — creează prezența pe lecția aleasă și marchează recovery `reserved`
- [ ] Recovery nu generează deducere din sold unități (GAP-007) dacă curs are `recoveryIncluded = true`
- [ ] Câmp `recoveryIncluded boolean default true` adăugat pe `courses`
- [ ] Dacă tutorele nu acționează în 48h, recovery → `expired` (cron sau lazy)
- [ ] Notificare COMM-205 trimisă la crearea recovery_request cu link-ul tokenizat

## Fișiere implicate

- `server/db/schema/` — tabel `recovery_requests`
- `server/db/schema/courses.ts` — `recoveryIncluded`
- `server/routes/lessons.ts` — hook la PATCH attendance absent
- `server/routes/recovery.ts` — endpoints publice GET + POST
- `src/pages/app/SchedulePage.tsx` — indicator recovery creat

## Teste

- Unit: absență → recovery_request creat cu sloturi populate
- Unit: `GET /recovery/:token` fără auth → returnează sloturi
- Unit: `POST /recovery/:token/reserve` → prezență marcată + recovery `reserved`
- Unit: token expirat → 410 Gone
- Unit: recuperare nu consumă unități dacă `recoveryIncluded = true`

## DoD

Build + typecheck + lint + teste verzi. Migrare comisă. `db:reset && db:seed` trece. PR pe branch `feat/GAP-faza-1-trial-flow`.
