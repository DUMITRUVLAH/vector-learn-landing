---
id: GAP-015
title: Teme și sarcini per lecție — profesor adaugă temă, student confirmă rezolvare
milestone: GAP
phase: "5"
branch: feat/GAP-faza-5-operational
depends_on: [GAP-010]
---

## Goal
Profesorul poate atașa o temă (text + link opțional) la o lecție. Studentul vede tema în
portalul său și poate marca "Rezolvat" sau încărca un link (document Google Drive etc.).
Directorul vede rata de completare a temelor per clasă/profesor.

## User stories
- Ca profesor, vreau să adaug o temă la lecție din interfața de gestionare orar, ca să știu că studenții au de lucru.
- Ca student, vreau să văd temele în portalul meu, ca să nu le uit.
- Ca director, vreau să văd câte teme sunt rezolvate vs total, ca să evaluez angajamentul.

## Acceptance criteria
- [ ] Schema `homework` (id, tenantId, lessonId, description, linkUrl nullable, dueAt nullable, createdByUserId, createdAt).
- [ ] Schema `homework_submissions` (id, tenantId, homeworkId, studentId, status todo/done, submittedAt, linkUrl nullable).
- [ ] API CRUD `/api/homework` (requireAuth).
- [ ] API `POST /api/portal/:token/homework/:id/submit` — student marchează done.
- [ ] API `GET /api/portal/:token/homework` — lista teme nerezolvate pentru student.
- [ ] SchedulePage.tsx: buton "Adaugă temă" pe o lecție.
- [ ] StudentPortalPage.tsx: secțiune "Teme" cu status.
- [ ] Design system, dark mode, zero hex.

## Files to create/modify
- `server/db/schema/homework.ts`
- `server/db/schema/index.ts`
- `drizzle/0034_gap015_homework.sql`
- `server/routes/homework.ts`
- `server/app.ts`
- `src/pages/app/SchedulePage.tsx`
- `src/pages/portal/StudentPortalPage.tsx`
- `src/__tests__/gap015-homework.test.ts`

## Tests
- **T-GAP-015-1** [blocant] Given POST /api/homework cu lessonId+description, Then 201 cu homework object
- **T-GAP-015-2** [blocant] Given POST /api/portal/:token/homework/:id/submit, Then submission status=done
- **T-GAP-015-3** [blocant] Given GET /api/portal/:token/homework, Then lista teme cu status
- **T-GAP-015-4** [blocant] Given SchedulePage render, Then fără crash cu buton "Adaugă temă"
- **T-GAP-015-5** [normal] Given StudentPortalPage cu teme, When render, Then temele afișate cu status corect

## Definition of Done
- Migrare 0034; db:reset + db:seed trec. Build verde. Teste blocante trec.
- Reviewer APPROVED. Integration-architect CONNECTED. Personas: manager BUY, student LOVES.
