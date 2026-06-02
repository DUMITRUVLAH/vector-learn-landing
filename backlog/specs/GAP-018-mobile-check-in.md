---
id: GAP-018
title: Check-in rapid la lecție — profesor marchează prezența de pe mobil cu un tap
milestone: GAP
phase: "5"
branch: feat/GAP-faza-5-operational
depends_on: [GAP-010]
---

## Goal
Profesorul accesează o pagina mobilă simplă (/app/checkin/:lessonId) unde vede lista studenților
înscriși la lecția curentă și poate marca prezent/absent cu un singur tap. Fără scroll pe
un tabel mare — UI tip listă de carduri mari cu buton verde/roșu.

## User stories
- Ca profesor, vreau să marchez prezența în 30 de secunde de pe telefon, ca să nu pierd timp.
- Ca director, vreau ca prezența marcată de profesor să apară instant în rapoarte, ca să fie actualizate.

## Acceptance criteria
- [ ] Pagina `CheckinPage.tsx` la `/app/checkin/:lessonId` — accesibilă cu sesiune admin.
- [ ] Afișează lista studenților înscriși la lecție (din lesson_participants sau cohort_participants).
- [ ] Tap pe card marchează present/absent — optimistic update + PATCH /api/lessons/:id/attendance.
- [ ] UI: carduri mari 60px+, buton Present verde, buton Absent roșu, touch target ≥ 44px.
- [ ] Design system, dark mode, zero hex.

## Files to create/modify
- `src/pages/app/CheckinPage.tsx`
- `src/App.tsx` (adaugă ruta)
- `src/__tests__/gap018-checkin.test.ts`

## Tests
- **T-GAP-018-1** [blocant] Given CheckinPage cu lessonId valid, When render, Then lista studenți afișată fără crash
- **T-GAP-018-2** [blocant] Given tap pe "Present", When PATCH attendance, Then optimistic update în UI
- **T-GAP-018-3** [normal] Given ecran mobil 375px, When render, Then touch targets ≥ 44px

## Definition of Done
- Build verde. Teste blocante trec. (Nu e migrare nouă — folosește schema existentă.)
- Reviewer APPROVED. Integration-architect CONNECTED. Personas: manager BUY, student OK.
