---
id: GAP-015
title: Excursii și tabere ca tip de eveniment
milestone: GAP
phase: 5
priority: LOW
status: pending
dependencies: [cohorts, cohortParticipants, invoices, COMM-205]
feeds_into: [GAP-010, GAP-011]
branch: feat/GAP-faza-5-operational
---

## Scop

Extinde modelul de cohorte cu tipul `tour`. O excursie are locuri limitate, dată plecare/întoarcere, preț per participant, link de înregistrare publică. Înscrierea generează factură automată.

## Criterii de acceptare

- [ ] Câmp `cohortType enum('course','tour','open_lesson') default 'course'` adăugat pe `cohorts`
- [ ] Câmpuri pentru tip `tour`: `departureDate date`, `returnDate date`, `meetingPoint varchar null`, `pricePerPersonCents integer null`, `maxParticipants integer null`
- [ ] Înrolarea în excursie (`POST /api/cohorts/:id/enroll`) generează factură automată dacă `pricePerPersonCents > 0`
- [ ] Link public de înregistrare `/public/tours/:slug` cu formular (fără login): nume, telefon, email
- [ ] Înregistrare externă → creează `cohortParticipant` cu `source: 'public'` și un `lead` în CRM
- [ ] CXPage afișează excursiile ca tab sau filtru separat față de cursuri

## Fișiere implicate

- `server/db/schema/cohorts.ts` — câmpuri noi
- `server/routes/cohorts.ts` — logică înrolare cu factură
- `src/pages/app/CXPage.tsx` — tab excursii
- `src/pages/public/TourPublicPage.tsx` — pagina publică nouă

## Teste

- Unit: înrolare excursie cu `pricePerPersonCents > 0` → factură creată
- Unit: link public `/public/tours/:slug` → 200 fără autentificare
- Smoke: CXPage afișează tab excursii

## DoD

Build + typecheck + lint + teste verzi. `db:reset && db:seed` trece. PR pe branch `feat/GAP-faza-5-operational`.
