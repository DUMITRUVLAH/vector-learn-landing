---
id: GAP-012
title: Gradebook — progres student per obiectiv/abilitate cu raport PDF pentru părinte
milestone: GAP
phase: "4"
branch: feat/GAP-faza-4-analytics
depends_on: [GAP-010]
---

## Goal
Profesorul poate înregistra evaluări (note/calificative) per student per obiectiv de învățare.
La finalul termenului, directorul/profesorul generează un raport PDF de progres pentru fiecare student
care poate fi trimis părintelui prin portal sau email.

## User stories
- Ca profesor, vreau să înregistrez note la obiective (Pronunție, Gramatică, Vocabular) pentru fiecare student, ca să urmăresc progresul.
- Ca director, vreau să generez un raport PDF de progres per student, ca să-l trimit părintelui.
- Ca student/parinte, vreau să văd progresul în portalul meu, ca să știu la ce mai am de lucru.

## Acceptance criteria
- [ ] Schema `learning_objectives` (id, tenantId, courseId, name, weight) și `student_grades` (id, tenantId, studentId, objectiveId, lessonId nullable, grade varchar, notes, gradedAt, gradedByUserId).
- [ ] API CRUD `/api/grades` (requireAuth) — GET/POST/PATCH per student.
- [ ] API `GET /api/portal/:token/progress` — returnează obiective + note pentru student.
- [ ] `GradeBookPage.tsx` în app — tabel obiective × studenți cu celule editabile.
- [ ] Raport PDF generat server-side (HTML→print CSS) la `GET /api/grades/:studentId/report.pdf`.
- [ ] Design system, dark mode, zero hex.

## Files to create/modify
- `server/db/schema/grades.ts` (objectives + student_grades)
- `server/db/schema/index.ts`
- `drizzle/0032_gap012_grades.sql`
- `server/routes/grades.ts`
- `server/app.ts`
- `src/pages/app/GradeBookPage.tsx`
- `src/App.tsx`
- `src/__tests__/gap012-grades.test.ts`

## Tests
- **T-GAP-012-1** [blocant] Given POST /api/grades cu studentId+objectiveId+grade valid, Then 201 cu grade object
- **T-GAP-012-2** [blocant] Given GET /api/portal/:token/progress, Then 200 cu grades array
- **T-GAP-012-3** [blocant] Given GET /api/grades/:studentId/report.pdf, Then 200 cu Content-Type text/html (sau PDF)
- **T-GAP-012-4** [blocant] Given GradeBookPage render, Then fără crash
- **T-GAP-012-5** [normal] Given celulă notă editată, When save, Then nota actualizată în UI

## Definition of Done
- Migrare 0032 generată; db:reset + db:seed trec. Build verde. Teste blocante trec.
- Reviewer APPROVED. Integration-architect CONNECTED. Personas: manager BUY, student OK.
