---
id: GAP-019
title: Gamificare — badge-uri de progres pentru studenți (first lesson, streak, milestone)
milestone: GAP
phase: "6"
branch: feat/GAP-faza-6-gamificare
depends_on: [GAP-012, GAP-015]
---

## Goal
Studenții câștigă badge-uri automate pentru realizări: prima lecție, streak de 5 lecții,
10 teme rezolvate, nivel finalizat. Badge-urile sunt vizibile în portalul student și în
fișa studentului din admin.

## User stories
- Ca student, vreau să câștig badge-uri, ca să fiu motivat să continui.
- Ca director, vreau să văd badge-urile unui student, ca să am un subiect de conversație pozitivă la ședințe cu părinții.

## Acceptance criteria
- [ ] Schema `badges` (id, code, name, description, iconEmoji) — tabel de definiții, seeded.
- [ ] Schema `student_badges` (id, tenantId, studentId, badgeCode, earnedAt).
- [ ] Job/helper `awardBadges(tenantId, studentId)` — verifică condițiile și acordă badge-urile lipsă.
- [ ] Se apelează awardBadges după: marcare prezent, homework submit, finalizare lecție.
- [ ] API `GET /api/students/:id/badges` (requireAuth).
- [ ] API `GET /api/portal/:token/badges` — portal student.
- [ ] StudentPortalPage.tsx: secțiune "Realizările mele" cu emoji badge-uri.
- [ ] Design system, dark mode, zero hex.

## Files to create/modify
- `server/db/schema/badges.ts`
- `server/db/schema/index.ts`
- `drizzle/0035_gap019_badges.sql`
- `server/lib/badgeEngine.ts`
- `server/routes/badges.ts`
- `server/app.ts`
- `src/pages/portal/StudentPortalPage.tsx`
- `src/__tests__/gap019-badges.test.ts`

## Tests
- **T-GAP-019-1** [blocant] Given student cu prima lecție marcată prezent, When awardBadges, Then badge "first_lesson" acordat
- **T-GAP-019-2** [blocant] Given GET /api/students/:id/badges, Then 200 cu array badges
- **T-GAP-019-3** [blocant] Given GET /api/portal/:token/badges, Then 200 cu badges array
- **T-GAP-019-4** [blocant] Given StudentPortalPage render, Then secțiunea badges vizibilă fără crash
- **T-GAP-019-5** [normal] Given badge deja acordat, When awardBadges re-run, Then nu se duplică

## Definition of Done
- Migrare 0035; db:reset + db:seed trec. Build verde. Teste blocante trec.
- Reviewer APPROVED. Integration-architect CONNECTED. Personas: manager BUY, student LOVES.
